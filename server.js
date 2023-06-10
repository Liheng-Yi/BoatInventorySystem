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

const ITEMS_PER_PAGE = 5;

app.use(bodyParser.json());

function fromDatastore(item) {
    item.id = item[Datastore.KEY].id;
    return item;
}
/* ------------- Begin load Model Functions ------------- */

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

function get_loads(page) {
    // Default offset: 0
    const offset = (page - 1) * ITEMS_PER_PAGE;

    const query = datastore.createQuery(LOAD)
        .limit(ITEMS_PER_PAGE)
        .offset(offset);

    const countQuery = datastore.createQuery(LOAD);

    // Promise to get loads count
    const countPromise = datastore.runQuery(countQuery).then(results => results[0].length);

    return Promise.all([
        datastore.runQuery(query),
        countPromise
    ]).then(([results, count]) => {
        const loads = results[0];
        return { loads, count };
    });
}


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

function check_load(object) {
    if (object.volume) {
        const volumeRegex = /^\d+$/;
        if (!volumeRegex.test(object.volume) || object.volume <= 0 || object.volume > 10000) {
            return 1;  // Error in 'volume'. It should be a positive integer and less than or equal to 10000.
        }
    }
    if (object.item) {
        if (object.item.length > 1000) {
            return 2;  // Error in 'item'. Length of the string should not exceed 1000 characters.
        }
    }
    if (object.id) {
        return 3;  // Updating the value of 'id' is not allowed
    }
}

function put_load(id, updated_load) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key)
        .then((load) => {
            if (load[0] === undefined || load[0] === null) {
                return undefined;
            } else {
                updated_load["id"] = id;  // Preserve the id
                return datastore.save({ "key": key, "data": updated_load });
            }
        });
}

/* ------------- Begin loadd Model Functions ------------- */

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

router_load.get('/', function(req, res) {
    const page = parseInt(req.query.page) || 1;

    get_loads(page)
        .then(({loads, count}) => {
            const response = {
                "loads": loads,
                "total_count": count
            };
            if (loads.length === ITEMS_PER_PAGE) {
                response.next = `${req.protocol}://${req.get('host')}/loads?page=${page + 1}`;
            }
            res.status(200).json(response);
        })
        .catch(err => {
            res.status(500).json({ 'Error': 'Failed to fetch loads' });
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

router_load.put('/:id', function (req, res) {
    // Check Accept and Content-Type headers
    if (!req.accepts('application/json') || req.get('Content-Type') !== 'application/json') {
        res.type('json');
        return res.status(406).json({
            "Error": "Not acceptable. Only application/json data type is supported for PUT request."
        });
    }

    let sign = check_load(req.body);  // Use check_load function
    switch(sign) {
    case 1:
        return res.status(400).json({
            "Error": "The volume attribute is invalid. It must be a positive integer and less than or equal to 10000."
        });
    case 2:
        return res.status(400).json({
            "Error": "The item attribute is too long. Maximum length is 1000 characters."
        });
    case 3:
        return res.status(400).json({
            "Error": "Updating the value of id is not allowed."
        });
    default:
    }

    let object = req.body;

    if (!req.body.volume){
        object.volume = null;
    }
    if (!req.body.item){
        object.item = null;
    }
    if (!req.body.creation_date){
        object.creation_date = null;
    }

    put_load(req.params.id, object)
        .then(load => {
            if (load === undefined) {
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } else {
                res.status(303).location(`/loads/${load.id}`).json(load);
            }
        });
});

router_load.patch('/:id', function (req, res) {
    // Check Accept and Content-Type headers
    if (!req.accepts('application/json') || req.get('Content-Type') !== 'application/json') {
        res.type('json');
        return res.status(406).json({
            "Error": "Not acceptable. Only application/json data type is supported for PATCH request."
        });
    }

    let sign = check_load(req.body);
    switch(sign) {
    case 1:
        return res.status(400).json({
            "Error": "The volume attribute is invalid. It must be a positive number."
        });
    case 2:
        return res.status(400).json({
            "Error": "The volume attribute is too large. Maximum value is 10000."
        });
    case 3:
        return res.status(400).json({
            "Error": "The item attribute is too long. Maximum length is 1000 characters."
        });
    default:
    }
    // Check if at least one valid attribute is present
    if (!req.body.volume && !req.body.item) {
        res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
        return;
    }
    patch_load(req.params.id, req.body)
        .then(load => {
            if (load === undefined) {
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } else {
                load["self"] = req.protocol + '://' + req.get('host') + req.originalUrl;
                res.status(200).json(load);
            }
        });
}); 



/* ------------- Begin boat Model Functions ------------- */
function post_boat(name, type, length) {
    var key = datastore.key(BOAT);

    const new_boat = { "name": name, "type": type, "length": length};
    return datastore.save({ "key": key, "data": new_boat }).then(() => {return key });
}

function get_boats() {
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        // Use Array.map to call the function fromDatastore. This function
        // adds id attribute to every element in the array at element 0 of
        // the variable entities
        return entities[0].map(fromDatastore);
    });
}

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

function patch_boat(id, updated_boat) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key)
        .then((boat) => {
            if (boat[0] === undefined || boat[0] === null) {
                return undefined;
            } else {
                Object.assign(boat[0], updated_boat);
                return datastore.save({ "key": key, "data": boat[0] })
                    .then(() => {
                        boat[0]["id"] = id;
                        return boat[0];
                    });
            }
        });
}


function put_boat(id, updated_boat) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key)
        .then((boat) => {
            if (boat[0] === undefined || boat[0] === null) {
                return undefined;
            } else {
                updated_boat["id"] = id;  // Preserve the id
                return datastore.save({ "key": key, "data": updated_boat });
            }
        });
}


function delete_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.delete(key);
}

function update_boat(id, name, type, length) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    const boat = { "name": name, "type": type, "length": length };
    return datastore.get(key)
        .then(() => {
                return datastore.save({ "key": key, "data": boat });
        });
}

    // update_slip(req.params.slip_id, req.params.boat_id)

function get_boat_by_name(name, id) {
    const query = datastore.createQuery(BOAT).filter('name', '=', name);
    console.log("000")
    return datastore.runQuery(query)
        .then((boats) => {
            console.log("111")
            boats[0][0].id = id;
            return boats[0][0]; // Return the first boat that matches the name, or undefined if no match
        
        });
}

async function isBoatNameUnique(name) {
    const query = datastore.createQuery(BOAT).filter('name', '=', name);
    const [boats] = await datastore.runQuery(query);
    return boats.length === 0;
}


function check_boat(object){
    console.log(object);
    if (object.name){
        const nameRegex = /^[a-zA-Z0-9 ]+$/;
        if (!nameRegex.test(object.name)) {
            return 1;
        }
        if (object.name.length > 30) {
            return 2;
        }
    }
    if(object.length) {
        const lengthRegex = /^\d+$/;
        if (!lengthRegex.test(object.length)) {
            return 3;
        }
        if(object.length > 1000) {
            return 4;
        }
    }
    if (object.type){
        const nameRegex = /^[a-zA-Z0-9 ]+$/;
        if (!nameRegex.test(object.type)) {
            return 5;
        }
        if (object.type.length > 30) {
            return 6;
        }
    }
    if (object.id) {
        return 7;
    }
}

async function isBoatNameUnique(name) {
  const query = datastore.createQuery(BOAT).filter('name', '=', name);
  const [boats] = await datastore.runQuery(query);
  return boats.length === 0;
}

function get_boats(page) {
    const offset = (page - 1) * ITEMS_PER_PAGE;

    const query = datastore.createQuery(BOAT)
        .limit(ITEMS_PER_PAGE)
        .offset(offset);

    const countQuery = datastore.createQuery(BOAT);

    // Promise to get boats count
    const countPromise = datastore.runQuery(countQuery).then(results => results[0].length);

    return Promise.all([
        datastore.runQuery(query),
        countPromise
    ]).then(([results, count]) => {
        const boats = results[0];
        return { boats, count };
    });
}



/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
/* ------------- boat ------------- */

router_boat.post('/', async function (req, res) {
    // Check Accept header
    if (!req.accepts('application/json')) {
        res.type('json');
        return res.status(406).json({
            "Error": "Not acceptable. Only application/json data type is supported for POST request."
        });
    }
    // Input validation
    if (!req.body.name || !req.body.type || !req.body.length) {
        return res.status(400).json({ 
            "Error": "The request object is missing at least one of the required attributes" 
        });
    }
    // check 
    let sign = check_boat(req.body);
    switch(sign) {
    case 1:
        return res.status(400).json({
            "Error": "The name attribute contains invalid characters. Only alphanumeric characters and spaces are allowed."
        });
    case 2:
        return res.status(400).json({
            "Error": "The name attribute is too long. Maximum length is 30 characters."
        });
    case 3:
        return res.status(400).json({
            "Error": "The length attribute is invalid. It must be a positive number."
        });
    case 4:
        return res.status(400).json({
            "Error": "The length attribute is too large. Maximum value is 1000."
        });
    case 5:
        return res.status(400).json({
            "Error": "The type attribute contains invalid characters. Only alphanumeric characters and spaces are allowed."
        });
    case 6:
        return res.status(400).json({
            "Error": "The type attribute is too long. Maximum length is 30 characters."
        });
    default:
    }
    // Check if boat name is unique
    if (req.body.name){
        const nameUnique = await isBoatNameUnique(req.body.name);
        if (!nameUnique) {
            return res.status(403).json({ "Error": "Boat name must be unique" });
        }
    }
    
    const alreadyHaveAttri = ['name', 'type', 'length'];
    const extra = Object.keys(req.body).filter(attr => !alreadyHaveAttri.includes(attr));
    if (extra.length > 0) {
        return res.status(400).json({
            "Error": `The request object contains extraneous attributes: ${extra.join(', ')}`
        });
    }

    try {
        const key = await post_boat(req.body.name, req.body.type, req.body.length);
        const boat = await get_boat(key.id);
        boat[0]["self"] = req.protocol + '://' + req.get('host') + req.originalUrl + "/" + key.id;
        res.status(201).json(boat[0]);
    } catch (err) {
        res.status(500).json({ "Error": "failed post" });
        
    }
});


router_boat.put('/:id', function (req, res) {
    // Check Accept and Content-Type headers
    if (!req.accepts('application/json') || req.get('Content-Type') !== 'application/json') {
        res.type('json');
        return res.status(406).json({
            "Error": "Not acceptable. Only application/json data type is supported for PATCH request."
        });
    }

    let sign = check_boat(req.body);
    switch(sign) {
    case 1:
        return res.status(400).json({
            "Error": "The name attribute contains invalid characters. Only alphanumeric characters and spaces are allowed."
        });
    case 2:
        return res.status(400).json({
            "Error": "The name attribute is too long. Maximum length is 30 characters."
        });
    case 3:
        return res.status(400).json({
            "Error": "The length attribute is invalid. It must be a positive number."
        });
    case 4:
        return res.status(400).json({
            "Error": "The length attribute is too large. Maximum value is 1000."
        });
    case 5:
        return res.status(400).json({
            "Error": "The type attribute contains invalid characters. Only alphanumeric characters and spaces are allowed."
        });
    case 6:
        return res.status(400).json({
            "Error": "The type attribute is too long. Maximum length is 30 characters."
        });
    case 7:
        return res.status(400).json({
            "Error": "Updating the value of id is not allowed"
        });
    default:
    }
    let object = req.body

    if (!req.body.name){
        object.name = null
    }
    if (!req.body.type){
        object.type = null
    }
    if (!req.body.length){
        object.length = null
    }

    // If 'name' is being updated, check if the new name is already used
    if (req.body.name) {
        get_boat_by_name(req.body.name, req.params.id)
            .then(existingBoat => {
                if (existingBoat){
                    let existingBoatId = existingBoat.id;
                    if (existingBoatId !== req.params.id) {
                    // A different boat with the new name already exists
                    res.status(403).json({ "Error": "The name of a boat must be unique" });
                    }
                    put_boat(req.params.id, object)
                        .then(boat => {
                            if (boat === undefined) {
                                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                            } else {
                                res.status(303).location(`/boats/${req.params.id}`).send();
                            }
                        });
                }
            });
    } else {
        // 'name' is not being updated, proceed with the update
        put_boat(req.params.id, object)
            .then(boat => {
                if (boat === undefined) {
                    res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                } else {
                    res.status(303).location(`/boats/${boat.id}`).json(boat);
                }
            });
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

router_boat.patch('/:id', function (req, res) {
    // Check Accept and Content-Type headers
    if (!req.accepts('application/json') || req.get('Content-Type') !== 'application/json') {
        res.type('json');
        return res.status(406).json({
            "Error": "Not acceptable. Only application/json data type is supported for PATCH request."
        });
    }
    let sign = check_boat(req.body);
    switch(sign) {
    case 1:
        return res.status(400).json({
            "Error": "The name attribute contains invalid characters. Only alphanumeric characters and spaces are allowed."
        });
    case 2:
        return res.status(400).json({
            "Error": "The name attribute is too long. Maximum length is 30 characters."
        });
    case 3:
        return res.status(400).json({
            "Error": "The length attribute is invalid. It must be a positive number."
        });
    case 4:
        return res.status(400).json({
            "Error": "The length attribute is too large. Maximum value is 1000."
        });
    case 5:
        return res.status(400).json({
            "Error": "The type attribute contains invalid characters. Only alphanumeric characters and spaces are allowed."
        });
    case 6:
        return res.status(400).json({
            "Error": "The type attribute is too long. Maximum length is 30 characters."
        });
    default:
    }
    
    // Check if at least one valid attribute is present
    if (!req.body.name && !req.body.type && !req.body.length) {
        res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
        return;
    }

    if (req.body.name) {
        get_boat_by_name(req.body.name, req.params.id)
            .then(existingBoat => {
                if (existingBoat && existingBoat.id !== req.params.id) {
                    // A different boat with the new name already exists
                    res.status(403).json({ "Error": "The name of a boat must be unique" });
                } else {
                    // The new name is not used by other boats, proceed with the update
                    patch_boat(req.params.id, req.body)
                    .then(boat => {
                        if (boat === undefined) {
                            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                        } else {
                            boat["self"] = req.protocol + '://' + req.get('host') + req.originalUrl;
                            res.status(200).json(boat);
                        }
                    });
                }
            });
    } else {
        patch_boat(req.params.id, req.body)
            .then(boat => {
                if (boat === undefined) {
                    res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                } else {
                    patch_boat(req.params.id, req.body)
                    .then(boat => {
                        if (boat === undefined) {
                            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                        } else {
                            boat["self"] = req.protocol + '://' + req.get('host') + req.originalUrl;
                            res.status(200).json(boat);
                        }
                    });
                }
            });
    }
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

router_boat.put('/', function (req, res) {
    res.status(405).json({ "Error": "PUT method is not supported on this endpoint. Please send the PUT request to /boats/{id}" });
});

router_boat.delete('/', function (req, res) {
    res.status(405).json({ "Error": "DELETE method is not supported on this endpoint. Please send the DELETE request to /boats/{id}" });
});

router_boat.get('/:id', function (req, res) {
    get_boat(req.params.id)
        .then(boat => {
            if (!req.accepts('application/json') || !req.accepts('text/html') ) {
                    res.status(415).json(boat[0]);
                }
            if (boat[0] === undefined || boat[0] === null) {
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            } else {
                boat[0]["self"] = req.protocol + '://' + req.get('host') + req.originalUrl;
                if (req.accepts('application/json')) {
                    res.status(200).json(boat[0]);
                } else if (req.accepts('text/html')) {
                    let html = `<ul>
                        <li>Name: ${boat[0].name}</li>
                        <li>Type: ${boat[0].type}</li>
                        <li>Length: ${boat[0].length}</li>
                        <li>ID: ${boat[0].id}</li>
                        <li>Self: ${boat[0].self}</li>
                    </ul>`;
                    res.status(200).send(html);
                }
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


router_boat.get('/', function(req, res) {
    const page = parseInt(req.query.page) || 1;

    get_boats(page)
        .then(({boats, count}) => {
            const response = {
                "boats": boats,
                "total_count": count
            };
            if (boats.length === ITEMS_PER_PAGE) {
                response.next = `${req.protocol}://${req.get('host')}/boats?page=${page + 1}`;
            }
            res.status(200).json(response);
        })
        .catch(err => {
            res.status(500).json({ 'Error': 'Failed to fetch boats' });
        });
});



/* ------------- End Controller Functions ------------- */

app.use('/boats', router_boat);
app.use('/loads', router_load);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});