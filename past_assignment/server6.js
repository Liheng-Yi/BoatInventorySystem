const express = require('express');
const https = require('https');
const crypto = require('crypto');
const { Datastore } = require('@google-cloud/datastore');
const app = express();
const port = process.env.PORT || 8080;
const fs = require('fs');
const path = require('path');

const datastore = new Datastore();

app.get('/', async (req, res) => {
  const state = crypto.randomBytes(10).toString('hex');
  const key = datastore.key('State');
  await datastore.save({ key, data: { value: state } });

  const link = 'https://accounts.google.com/o/oauth2/v2/auth?' +
    'client_id=853125543414-g63sm6iec04sr9t3nabo2u7duncqc6lf.apps.googleusercontent.com' +
    '&redirect_uri=http://localhost:8080/oauth' +
    '&response_type=code' +
    '&scope=https://www.googleapis.com/auth/userinfo.profile' +
    `&state=${state}`;
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    html = html.replace('URL_TO_REPLACE', link);
    res.send(html);
});

app.get('/oauth', async (req, res) => {
    const { code, state } = req.query;
    const query = datastore.createQuery('State').filter('value', '=', state);
    const [states] = await datastore.runQuery(query);
    const data = JSON.stringify({
        code: code,
        client_id: '853125543414-g63sm6iec04sr9t3nabo2u7duncqc6lf.apps.googleusercontent.com',
        client_secret: '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',
        redirect_uri: 'http://localhost:8080/oauth',
        grant_type: 'authorization_code'
    });

    const options = {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);

        
        response.on('end', () => {
            const { access_token } = JSON.parse(body);
            getUserInfo(access_token, res,state);
        });
    });

    req.write(data);
    req.end();
});

function getUserInfo(access_token, res,state) {
    // cite from https://developers.google.com/people/api/rest/v1/people/get
    const options = {
    hostname: 'people.googleapis.com',
    path: '/v1/people/me?personFields=names',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    };

  const req = https.request(options, (response) => {
    let body = '';
    response.on('data', chunk => body += chunk);
    response.on('end', () => {
      const { names } = JSON.parse(body);
      console.log(body)
      const { givenName, familyName } = names[0];
      res.send(`Your given name: ${givenName}, Your family name: ${familyName}, and the state: ${state}`);
    });
  });

  req.end();
}

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
