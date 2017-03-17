const express = require('express');
const fs = require('fs');
const concat = require('concat-stream');
const path = require('path');
const Pushback = require('./pushback');

const app = express();

var configFile = process.env.CONFIG;
if(!configFile) {
    configFile = path.join(__dirname, 'config.json');
}

const config = JSON.parse(fs.readFileSync(configFile));

const pushback = new Pushback(config);

// authentication for providers.
// Should throw an error if not allowed
// Should return false if deployment is not required.
const providers = {
    'github': function(payload, repo) {
        if(!payload.secret) throw new Error("No secret set");
        if(payload.secret != repo.secret) throw new Error("Bad secret");
    }
}

function auth(req, res, next) {
    var key = req.headers['x-api-key'];
    if(key === undefined) return res.status(403).send({error: 'Missing API key'});
    if(key != config.apiKey) return setTimeout(() => {
        res.status(403).send({error: 'Bad API key'});
    }, 1000);

    next();
}

app.get('/apps', auth, function(req, res) {
    res.send(pushback.config.repos);
});

app.get('/apps/:name', auth, function(req, res) {
    pushback.deploy(req.params.name, (err, output) => {
        if(err) {
            return res.status(400).send({error: err.message, output});
        }
        res.send({message: "Deploy successful", output});
    });
});

app.post('/apps/:name', function(req, res) {

    var c = concat((raw) => {

        // need to authenticate the payload
        try {
            var payload = JSON.parse(raw);
            var repo = pushback.getRepo(req.params.name);
            var provider = repo.provider || 'github';
            if(providers[provider] === undefined) throw new Error("No such provider: " + provider);
            var shouldDeploy = providers[provider](payload, repo);
        } catch(e) {
            return setTimeout(() => {
                res.status(400).send({error: e.message});
            }, 1000);
        }

        if(shouldDeploy === false) {
            return res.send({message: "Skipped deployment"});
        }

        // should be good to deploy
        pushback.deploy(req.params.name, (err, output) => {
            // only give away minimal details
            if(err) {
                return res.status(400).send({error: "Error deploying - see logs for details"});
            }
            res.send({message: "Deployed successfully"});
        });
    });

    c.on('error', (err) => {
        res.status(400).send({error: err.message});
    });

    req.pipe(c);
});


var port = process.env.PORT || 1401;

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});

