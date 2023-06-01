const express = require('express');
const app = express();
app.enable('trust proxy');

const { Datastore } = require('@google-cloud/datastore');
const bodyParser = require('body-parser');

const datastore = new Datastore();

const BOAT = "Boat";
const LOAD = "Load";

const router_boat = express.Router();
const router_load = express.Router();

app.use(bodyParser.json());

function fromDatastore(item) {
    item.id = item[Datastore.KEY].id;
    return item;
}

/* ------------- Begin boat Model Functions ------------- */
function post_boat(name, type, length, loads) {
    var key = datastore.key(BOAT);
    if (loads == undefined)
    loads = []
    const new_boat = { "name": name, "type": type, "length": length, "loads": loads };
    return datastore.save({ "key": key, "data": new_boat }).then(() => {return key });
}


/**
 * The function datastore.query returns an array, where the element at index 0
 * is itself an array. Each element in the array at element 0 is a JSON object
 * with an entity fromt the type "boat".
 */
function get_boats() {
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        // Use Array.map to call the function fromDatastore. This function
        // adds id attribute to every element in the array at element 0 of
        // the variable entities
        return entities[0].map(fromDatastore);
    });
}


/**
 * This function is not in the code discussed in the video. It demonstrates how
 * to get a single entity from Datastore using an id.
 * Note that datastore.get returns an array where each element is a JSON object 
 * corresponding to an entity of the Type "boat." If there are no entities
 * in the result, then the 0th element is undefined.
 * @param {number} id Int ID value
 * @returns An array of length 1.
 *      If a boat with the provided id exists, then the element in the array
 *           is that boat
 *      If no boat with the provided id exists, then the value of the 
 *          element is undefined
 */
function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(fromDatastore);
        }
    });
}

function get_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(fromDatastore);
        }
    });
}


function put_boat(id, name, type, length) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    const boat = { "name": name, "type": type, "length": length };
    return datastore.save({ "key": key, "data": boat });
}

function delete_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.delete(key);
}

function update_boat(id, name, type, length, loads) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    const boat = { "name": name, "type": type, "length": length, "loads": loads };
    return datastore.get(key)
        .then(() => {
                return datastore.save({ "key": key, "data": boat });
        });
}

    // update_slip(req.params.slip_id, req.params.boat_id)



/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */



router_boat.post('/', function (req, res) {

    if (req.body.name && req.body.type && req.body.length) {
        post_boat(req.body.name, req.body.type, req.body.length)
        .then(key => { 
            get_boat(key.id)
            .then(boat => {
                boat[0]["self"] = req.protocol + '://' + req.get('host') + req.originalUrl + "/" + key.id;
                res.status(201).json(boat[0]);
            })
        });
    }else if (!req.body.name || !req.body.type || !req.body.length) {
        res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
    return;
    }
});


router_boat.put('/:boat_id/loads/:load_id', function(req, res) {
    get_boat(req.params.boat_id)
    .then(boat => {
        if (boat[0]) {
            get_load(req.params.load_id)
            .then(load => {
                if (load[0]) {
                    if (load[0].carrier !== null) {
                        res.status(403).json({"Error": "The load is already loaded on another boat"});
                    } else {
                        load[0].carrier = {
                            "id": boat[0].id,
                            "name": boat[0].name,
                            "self": req.protocol + '://' + req.get('host') + "/boats/" + boat[0].id
                        };
                        // Add load to the boat's loads array
                        if(!boat[0].loads){
                            boat[0].loads = [];
                        }
                        boat[0].loads.push({
                            "id": load[0].id,
                            "self": req.protocol + '://' + req.get('host') + "/loads/" + load[0].id
                        });
                        // Update the load and the boat in the datastore
                        update_load(req.params.load_id, load[0])
                        .then(() => {
                            update_boat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, boat[0].loads)
                            .then(() => {
                                res.status(204).end();
                            });
                        });
                    }
                } else {
                    res.status(404).json({"Error": "The specified boat and/or load does not exist"});
                }
            });
        } else {
            res.status(404).json({"Error": "The specified boat and/or load does not exist"});
        }
    });
});

router_boat.delete('/:boat_id/loads/:load_id', function(req, res) {
    get_boat(req.params.boat_id)
    .then(boat => {
        if (!boat[0]) {
            res.status(404).json({ "Error": "No boat with this boat_id is loaded with the load with this load_id" });
        } else {
            get_load(req.params.load_id)
            .then(load => {
                if (!load[0]) {
                    res.status(404).json({ "Error": "No boat with this boat_id is loaded with the load with this load_id" });
                } else if (!load[0].carrier || load[0].carrier.id !== boat[0].id) {
                    res.status(404).json({ "Error": "No boat with this boat_id is loaded with the load with this load_id" });
                } else {
                    load[0].carrier = null;
                    update_load(req.params.load_id, load[0])
                    .then(() => {
                        boat[0].loads = boat[0].loads.filter(load => load.id !== req.params.load_id);
                        update_boat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, boat[0].loads)
                        .then(() => {
                            res.status(204).end();
                        });
                    });
                }
            });
        }
    });
});



router_boat.put('/:id', function (req, res) {
    put_boat(req.params.id, req.body.name, req.body.type, req.body.length)
        .then(res.status(200).end());
});



/**
 * This route is not in the file discussed in the video. It demonstrates how to
 * get a single boat from Datastore using the provided id and also how to 
 * determine when no boat exists with that ID.
 */

router_boat.get('/:id', function (req, res) {
    get_boat(req.params.id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                // The 0th element is undefined. This means there is no boat with this id
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            } else {
                // Return the 0th element which is the boat with this id
                boat[0]["self"] = req.protocol + '://' + req.get('host') + req.originalUrl;
                res.status(200).json(boat[0]);
            }
        });
});





router_boat.patch('/:id', function (req, res) {
    if (!req.body.name || !req.body.type || !req.body.length) {
    res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
    return;
    }
    get_boat(req.params.id)
    .then(boat => {
        if (boat[0] === undefined || boat[0] === null) {
            // The 0th element is undefined. This means there is no boat with this id
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            return
        }
        else{
            update_boat(req.params.id, req.body.name, req.body.type, req.body.length)
            .then(() => {
                get_boat(req.params.id)
                    .then(boat => {
                        res.status(200).json(boat[0]);
                    })
            });
        }
    });
});


router_boat.delete('/:id', function(req, res) {
    // Obtain the boat id
    const boat_id = req.params.id;

    // Retrieve the boat
    get_boat(boat_id)
    .then(boat => {
        // Ensure the boat exists
        if (boat[0] === undefined || boat[0] === null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            return;
        }
        Promise.all(boat[0].loads.map(load => {
            // Unassign the load from the boat
            load.carrier = null;

            // Update the load
            return update_load_carrier(load.id, load.carrier);
        }))
        .then(() => {
            // Delete the boat
            delete_boat(boat_id)
            .then(() => {
                res.status(204).end();
            });
        })
        .catch(err => {
            console.error(err);
            res.status(500).end();
        });
    });
});

router_load.delete('/:id', function(req, res) {
    const load_id = req.params.id;
    get_load(load_id)
        .then(load => {
            if (!load[0]) {
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } else {
                const carrier = load[0].carrier;

                if (carrier) {
                    // This load is carried by a boat, update the boat to remove this load
                    get_boat(carrier.id)
                        .then(boat => {
                                // Remove the load from the boat's loads array
                                boat[0].loads = boat[0].loads.filter(load => load.id !== load_id);
                                // Update the boat in the datastore
                                update_boat(carrier.id, boat[0].name, boat[0].type, boat[0].length, boat[0].loads)
                                    .then(() => {
                                        delete_load(load_id)
                                            .then(() => {
                                                res.status(204).end();
                                            });
                                    });
                        });
                } else {
                    delete_load(load_id)
                        .then(() => {
                            res.status(204).end();
                        });
                }
            }
        });
});

router_boat.delete('/:boat_id/loads/:load_id', function(req, res) {
    get_boat(req.params.boat_id)
    .then(boat => {
        if (boat[0]) {
            get_load(req.params.load_id)
            .then(load => {
                if (load[0] && load[0].carrier && load[0].carrier.id === boat[0].id) {
                    load[0].carrier = null;
                    update_load(req.params.load_id, load[0])
                    .then(() => {
                        boat[0].loads = boat[0].loads.filter(load => load.id !== req.params.load_id);
                        update_boat(req.params.boat_id, boat[0].name, boat[0].type, boat[0].length, boat[0].loads)
                        .then(() => {
                            res.status(204).end();
                        });
                    });
                } else {
                    res.status(404).json({"Error": "No load with this load_id is assigned to the boat with this boat_id"});
                }
            });
        } else {
            res.status(404).json({"Error": "No boat with this boat_id exists"});
        }
    });
});

router_load.get('/:id', function (req, res) {
    get_load(req.params.id)
        .then(load => {
            if (load[0]) {
                load[0]["self"] = req.protocol + '://' + req.get('host') + req.originalUrl;
                res.status(200).json(load[0]);
            } else {
                res.status(404).json({ "Error": "No load with this load_id exists" });
            }
        });
});

router_boat.get('/:id/loads', async function (req, res) {
    try {
        const boat = await get_boat(req.params.id);
        if (!boat[0]) {
            return res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        } 
        const loads = await get_loads_for_boat(boat[0].id);
        const loadObjects = loads.map(load => ({
            "id": load.id,
            "item": load.item,
            "volume": load.volume,
            "creation_date": load.creation_date,
            "self": req.protocol + '://' + req.get('host') + "/loads/" + load.id
        }));
        return res.status(200).json({"loads": loadObjects});
    } catch (error) {
        // Handle any error that occurred during the operation
        console.error(error);
        res.status(500).json({ 'Error': 'Failed to fetch loads for boat' });
    }
});


const ITEMS_PER_PAGE = 3;

router_load.get('/', function(req, res) {
    const page = parseInt(req.query.page) || 1;

    get_loads(page)
        .then(loads => {
            res.status(200).json({ "loads": loads });
        })
        .catch(err => {
            res.status(500).json({ 'Error': 'Failed to fetch loads' });
        });
});

function get_loads(page) {
    // defalut offset: 0 for this assignment's purpose
    const offset = (page - 1) * ITEMS_PER_PAGE;

    const query = datastore.createQuery(LOAD)
        .limit(ITEMS_PER_PAGE)
        .offset(offset);

    return datastore.runQuery(query)
        .then(results => {
            const loads = results[0];
            console.log(results)
            return loads;
        });
}

router_boat.get('/', function(req, res) {
    const page = parseInt(req.query.page) || 1;

    get_boats(page)
        .then(boats => {
            res.status(200).json({ "boats": boats });
        })
        .catch(err => {
            res.status(500).json({ 'Error': 'Failed to fetch boats' });
        });
});


function get_boats(page) {
    const offset = (page - 1) * ITEMS_PER_PAGE;

    const query = datastore.createQuery(BOAT)
        .limit(ITEMS_PER_PAGE)
        .offset(offset);

    return datastore.runQuery(query)
        .then(results => {
            // The results include both the entities and some metadata, we just want the entities
            const boats = results[0];

            // Return the boats
            return boats;
        });
}

function get_loads_for_boat(boat_id) {
    // Create a query that finds loads where the carrier id matches the boat id
    const query = datastore.createQuery(LOAD).filter('carrier.id', '=', boat_id);
    
    // Execute the query and return a promise that resolves with the results
    return datastore.runQuery(query)
        .then(results => {
            // The results include both the entities and some metadata, we just want the entities
            const loads = results[0];

            // Return the loads
            return loads;
        });
}

router_load.post('/', function (req, res) {
    if (req.body.volume && req.body.item && req.body.creation_date) {
        let carrier = null;
        if (req.body.carrier) {
            carrier = {
                "id": req.body.carrier.id,
                "name": req.body.carrier.name,
                "self": req.body.carrier.self
            }
        }
        post_load(req.body.volume, req.body.item, req.body.creation_date, carrier)
        .then(key => { 
            get_load(key.id)
            .then(load => {
                load[0]["self"] = req.protocol + '://' + req.get('host') + "/loads/" + load[0].id;
                res.status(201).json(load[0]);
            })
        });
    } else {
        res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
    }
});




function post_load(volume, item, creation_date, carrier = null) {
    var key = datastore.key(LOAD);
    const new_load = { 
        "volume": volume, 
        "item": item, 
        "creation_date": creation_date,
        "carrier": carrier,
    };
    return datastore.save({ "key": key, "data": new_load }).then(() => {return key });
}

function update_load(id, load_data) {
    const transaction = datastore.transaction();
    const key = datastore.key([LOAD, parseInt(id, 10)]);

    return transaction.run()
        .then(() => transaction.get(key))
        .then(([load]) => {
            if (!load) {
                throw new Error('Load does not exist.');
            }
            transaction.save({
                key: key,
                data: load_data,
            });

            return transaction.commit();
        })
}
function update_load_carrier(load_id, new_carrier) {
    const key = datastore.key([LOAD, parseInt(load_id, 10)]);
    
    // First get the load
    return datastore.get(key)
        .then((load) => {
            // If the load doesn't exist, throw an error
            if (!load[0]) {
                throw new Error('Load not found');
            }
            
            // Update the carrier of the load
            load[0].carrier = new_carrier;
            
            // Save the load back to the datastore
            return datastore.save({
                key: key,
                data: load[0]
            });
        });
}

function delete_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.delete(key);
}


/* ------------- End Controller Functions ------------- */

app.use('/boats', router_boat);
app.use('/loads', router_load);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});