const express = require('express');
const app = express();

const json2html = require('json-to-html');

const {Datastore} = require('@google-cloud/datastore');

const bodyParser = require('body-parser');
const request = require('request');
const { auth, requiresAuth } = require('express-openid-connect');
const datastore = new Datastore();

// const jwksRsa = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');


const LODGING = "Lodging";
const BOAT = "Boat";


const router = express.Router();
const login = express.Router();
const boatRouter = express.Router();


const CLIENT_ID = 'sKBVV2ImsNIbXM1rvbLZyNnrqFra0Zrp';
const CLIENT_SECRET = 'DdtquIFH2T2pR6FOf1OGz887LlfZGp2h8D05WLlhoUfQJlQCP-9dVqxu1PWtv6mH';
const DOMAIN = 'assignemnt7.us.auth0.com';

app.use(bodyParser.json());


// Import Express and Express OpenID Connect





function fromDatastore(item){
    item.id = item[Datastore.KEY].id;
    return item;
}


const client = jwksClient({
  jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
});

function getKey(header, callback){
  client.getSigningKey(header.kid, function(err, key) {
    var signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}


// console.log("!!!")
// app.use(function (err, req, res, next) {
//   if (err.name === 'UnauthorizedError') {
//     res.status(401).send('Invalid token');
//   }
//   else {
//     next();
//   }
// });
// console.log("!!!2")



/* ------------- Begin Lodging Model Functions ------------- */


function get_boats(owner){
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then( (entities) => {
        return entities[0].map(fromDatastore).filter( boat => boat.owner === owner && boat.public === true );
    });
}



/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

function post_boat(name, type, length, owner){
    var key = datastore.key(BOAT);
    const new_boat = {"name": name, "type": type, "length": length, "owner": owner};
    return datastore.save({"key":key, "data":new_boat}).then(() => {return {...new_boat, "id": key.id}});
}

const verifyToken = (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      issuer: `https://${DOMAIN}/`,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        reject('Unauthorized');
      } else {
        resolve(decoded);
      }
    });
  });
}

const createBoat = (req) => {
  const name = req.body.name;
  const type = req.body.type;
  const length = req.body.length;
  const owner = req.user.sub;

  return post_boat(name, type, length, owner);
}

boatRouter.post('/', (req, res) => {
  const token = req.headers.authorization.split('Bearer ')[1]; // get the token from header
  
  verifyToken(token)
    .then(decoded => {
      req.user = decoded; 
      return createBoat(req);
    })
    .then(boat => {
      res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/' + boat.id);
      res.status(201).json(boat);
    })
    .catch(error => {
      console.log(error);
      res.status(error === 'Unauthorized' ? 401 : 500).send(error);
    });
});


boatRouter.get('/owners/:owner_id/boats', (req, res) => {
    const owner_id = req.params.owner_id;
    console.log("111");
    get_boats(owner_id)
        .then(boats => res.status(200).json(boats))
        .catch(error => {
            console.error(error);
            res.status(500).send('Error retrieving boats');
        });
});

function get_boats(owner){
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then( (entities) => {

        return entities[0].map(fromDatastore).filter( boat => boat.owner === owner );

    });
}





// cite: https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback

boatRouter.get('/', (req, res) => {
    const token = req.headers.authorization?.split('Bearer ')[1]; // get the token from header
    if (token) {
        jwt.verify(token, getKey, {
            issuer: `https://${DOMAIN}/`,
            algorithms: ['RS256']
        }, (err, decoded) => {
            if (err) {
                get_boats(null, true)
                    .then(boats => res.status(200).json(boats))
                    .catch(error => {
                        console.error(error);
                        res.status(500).send('Error retrieving boats');
                    });
            } else {
                const owner = decoded.sub; 
                get_boats(owner)
                    .then(boats => res.status(200).json(boats))
                    .catch(error => {
                        console.error(error);
                        res.status(500).send('Error retrieving boats');
                    });
            }
        });
    } else {
        get_boats(null, true)
            .then(boats => res.status(200).json(boats))
            .catch(error => {
                console.error(error);
                res.status(500).send('Error retrieving boats');
            });
    }
});
// cite: https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback




function delete_boat(boat_id) {
    const key = datastore.key([BOAT, parseInt(boat_id,10)]);
    return datastore.delete(key);
}

function get_boat(boat_id) {
    const key = datastore.key([BOAT, parseInt(boat_id,10)]);
    return datastore.get(key).then((data) => fromDatastore(data[0]));
}


boatRouter.delete('/:boat_id', (req, res) => {
    const token = req.headers.authorization?.split('Bearer ')[1]; // get the token from header
    if (token) {
        jwt.verify(token, getKey, {
            issuer: `https://${DOMAIN}/`,
            algorithms: ['RS256']
        }, (err, decoded) => {
            if (err) {
                res.status(401).send('Unauthorized');
            } else {
                const boat_id = req.params.boat_id;
                const owner = decoded.sub;
                get_boat(boat_id)
                    .then(boat => {
                        if (boat) {
                            if (boat.owner === owner) {
                    
                                delete_boat(boat_id)
                                    .then(() => res.status(204).end())
                                    .catch(error => {
                                        console.error(error);
                                        res.status(500).send('Error deleting boat');
                                    });
                            } else {
                                res.status(403).send('Forbidden: You are not the owner of this boat.');
                            }
                        } else {
                            res.status(403).send('Forbidden: No boat with this ID exists.');
                        }
                    })
                    .catch(error => {
                        console.error(error);
                        res.status(403).send('No boat exists with this id');
                    });
            }
        });
    } else {
        res.status(401).send('Unauthorized');
    }
});













login.post('/', function(req, res){
    const username = req.body.username;
    const password = req.body.password;
    var options = { method: 'POST',
            url: `https://${DOMAIN}/oauth/token`,
            headers: { 'content-type': 'application/json' },
            body:
             { grant_type: 'password',
               username: username,
               password: password,
               client_id: CLIENT_ID,
               client_secret: CLIENT_SECRET },
            json: true };
    request(options, (error, response, body) => {
        if (error){
            res.status(500).send(error);
        } else {
            res.send(body);
        }
    });

});


/* ------------- End Controller Functions ------------- */

app.use('/lodgings', router);
app.use('/login', login);
app.use('/boats', boatRouter);





// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});

// drbugging purpose
app.use(function (err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send('Invalid token');
  }
});