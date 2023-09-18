const express = require('express');
const app = express();

const { Datastore } = require('@google-cloud/datastore');
const bodyParser = require('body-parser');

const datastore = new Datastore();

const BOAT = "Boat";
const SLIP = "Slip";

const router_boat = express.Router();
const router_slip = express.Router();

app.use(bodyParser.json());

function fromDatastore(item) {
    item.id = item[Datastore.KEY].id;
    return item;
}

/* ------------- Begin boat Model Functions ------------- */
function post_boat(name, type, length) {
    var key = datastore.key(BOAT);
    const new_boat = { "name": name, "type": type, "length": length };
    return datastore.save({ "key": key, "data": new_boat }).then(() => {return key });
}

function post_slip(number, current_boat) {
    var key = datastore.key(SLIP);
    if (current_boat == undefined)
    current_boat = null
    const new_slip = { "number": number, "current_boat": current_boat};
    return datastore.save({ "key": key, "data": new_slip }).then(() => { return key });
    // console.log(new_slip);console.log(key)
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

function get_slips() {
    const q = datastore.createQuery(SLIP);
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
function get_slip(id) {
    const key = datastore.key([SLIP, parseInt(id, 10)]);
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

function update_boat(id, name, type, length) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    const boat = { "name": name, "type": type, "length": length };
    return datastore.get(key)
        .then(() => {
                return datastore.save({ "key": key, "data": boat });
        });
}
    // update_slip(req.params.slip_id, req.params.boat_id)

function update_slip(slip_id, number ,boat_id) {
    const key = datastore.key([SLIP, parseInt(slip_id, 10)]);

    const slip = { "number": number, "current_boat": boat_id};

    return datastore.get(key)
        .then(() => {
                return datastore.save({ "key": key, "data": slip });
        });
}


/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router_boat.get('/', function (req, res) {
    const boats = get_boats()
        .then((boats) => {
            res.status(200).json(boats);
        });
});

router_slip.get('/', function (req, res) {
    const slips = get_slips()
        .then((slips) => {
            res.status(200).json(slips);
        });
});

router_boat.post('/', function (req, res) {

    if (req.body.name && req.body.type && req.body.length) {
        post_boat(req.body.name, req.body.type, req.body.length)
        .then(key => { 
            get_boat(key.id)
            .then(boat => {
                res.status(201).json(boat[0]);
            })
        });
    }else if (!req.body.name || !req.body.type || !req.body.length) {
        res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
    return;
    }
});

router_slip.post('/',function (req,res) {
    if (!req.body.number){
        res.status(400).json({ "Error": "The request object is missing the required number" });
    } else if (req.body.number) {
    post_slip(req.body.number, req.body.current_boat)
        .then(key => { 
            get_slip(key.id)
            .then(slip => {
                res.status(201).json(slip[0]);
            })
        });
    return
    }
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
                res.status(200).json(boat[0]);
            }
        });
});

router_slip.get('/:id', function (req, res) {
    get_slip(req.params.id)
        .then(slip => {
            if (slip[0] === undefined || slip[0] === null) {
                // The 0th element is undefined. This means there is no boat with this id
                res.status(404).json({ 'Error': 'No slip with this slip_id exists' });
            } else {
                // Return the 0th element which is the boat with this id
                res.status(200).json(slip[0]);
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



router_slip.put('/:slip_id/:boat_id', function (req,res){
    get_slip(req.params.slip_id)
    .then(slip => {
        get_boat(req.params.boat_id)
            .then(boat => {
                if (boat[0] === undefined || boat[0] === null) {
                    // The 0th element is undefined. This means there is no boat with this id
                    res.status(404).json({ 'Error': 'The specified boat and/or slip does not exist' });
                    return
                }
                if (slip[0] === undefined || slip[0] === null) {
                res.status(404).json({ 'Error': 'The specified boat and/or slip does not exist' });
                return
                }
                if (slip[0].current_boat){
                    res.status(403).json({ 'Error': 'The slip is not empty' });
                    return
                }

                else{
                    update_slip(req.params.slip_id, slip[0].number, req.params.boat_id)
                    .then(() => {
                        get_slip(req.params.slip_id)
                            .then(slip => {
                                res.status(204).json(slip[0]);
                            })
                    });
                }
            });
    });
});

router_slip.delete('/:slip_id/:boat_id', function (req, res) {
    get_slip(req.params.slip_id)
        .then(slip => {
            if (slip[0] === undefined || slip[0] === null) {
                res.status(404).json({ 'Error': 'No boat with this boat_id is at the slip with this slip_id' });
                return;
            }
            if (slip[0].current_boat != req.params.boat_id) {
                res.status(404).json({ 'Error': 'No boat with this boat_id is at the slip with this slip_id' });
                return;
            }
            update_slip(req.params.slip_id, slip[0].number, null)
                .then(() => {
                    res.status(204).json();
                });
        });
});




router_boat.delete('/:boat_id', function (req,res){
    // Check if the boat exists
    get_boat(req.params.boat_id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                return;
            } else {
                // Find the slip that the boat is currently in
                get_slips()
                    .then(slips => {
                        const slip = slips.find(s => s.current_boat === req.params.boat_id);
                        if (slip) {
                            // Clear the current_boat attribute from the slip
                            slip.current_boat = null;
                            update_slip(slip.id, slip.number, null)
                                .then(() => {
                                    console.log('Boat removed from slip');
                                })
                                .catch((err) => {
                                    console.log('Error removing boat from slip:', err);
                                });
                        }
                        
                        // Delete the boat
                        delete_boat(req.params.boat_id)
                            .then(() => {
                                console.log("Boat deleted successfully");
                                res.status(204).send();
                            })
                            .catch((err) => {
                                console.log('Error deleting boat:', err);
                                res.status(500).json({ 'Error': 'Internal server error' });
                            });
                    });
            }
        });
});

function delete_slip(id) {
    const key = datastore.key([SLIP, parseInt(id, 10)]);
    return datastore.delete(key);
}

router_slip.delete('/:slip_id', function (req,res){
    // Check if the slip exists
    get_slip(req.params.slip_id)
        .then(slip => {
            if (slip[0] === undefined || slip[0] === null) {
                res.status(404).json({ 'Error': 'No slip with this slip_id exists' });
                return
            }
            else {
                // Delete the slip
                delete_slip(req.params.slip_id)
                    .then(() => {
                        console.log('Slip deleted');
                        res.status(204).send();
                    })
                    .catch((err) => {
                        console.log('Error deleting slip:', err);
                        res.status(500).json({ 'Error': 'Internal server error' });
                    });
            }
        });
});




/* ------------- End Controller Functions ------------- */

app.use('/boats', router_boat);
app.use('/slips', router_slip);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});