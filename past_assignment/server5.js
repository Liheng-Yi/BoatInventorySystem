const express = require('express');
const app = express();
app.enable('trust proxy');

const { Datastore } = require('@google-cloud/datastore');
const bodyParser = require('body-parser');

const datastore = new Datastore();

const BOAT = "Boat";


const router_boat = express.Router();


app.use(bodyParser.json());

function fromDatastore(item) {
    item.id = item[Datastore.KEY].id;
    return item;
}

/* ------------- Begin boat Model Functions ------------- */
function post_boat(name, type, length) {
    var key = datastore.key(BOAT);

    const new_boat = { "name": name, "type": type, "length": length};
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
/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */


function check(object){
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
    let sign = check(req.body);
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

    let sign = check(req.body);
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


router_boat.patch('/:id', function (req, res) {

    // Check Accept and Content-Type headers
    if (!req.accepts('application/json') || req.get('Content-Type') !== 'application/json') {
        res.type('json');
        return res.status(406).json({
            "Error": "Not acceptable. Only application/json data type is supported for PATCH request."
        });
    }
    let sign = check(req.body);
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



router_boat.delete('/:boat_id', function (req,res){
    get_boat(req.params.boat_id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                return;
            } else {
                // Delete the boat
                delete_boat(req.params.boat_id)
                    .then(() => {
                        console.log("Boat deleted successfully");
                        res.status(204).send();
                    })
            }
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



router_boat.patch('/:id', function (req, res) {
    if (!req.body.name || !req.body.type || !req.body.length) {
    res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
    return;
    }
    get_boat(req.params.id)
    .then(boat => {
        if (boat[0] === undefined || boat[0] === null) {
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

const ITEMS_PER_PAGE = 3;


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



/* ------------- End Controller Functions ------------- */

app.use('/boats', router_boat);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});