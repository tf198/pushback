const express = require('express');
const fs = require('fs');
const concat = require('concat-stream');
const path = require('path');
const Pushback = require('./pushback');
const crypto = require('crypto');

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
    'github': function(req, repo, next) {

        // secret validation
        if(!req.headers['x-hub-signature']) {
            return next(new Error("No signature"));
        }
        var parts = req.headers['x-hub-signature'].split('=');

        var hmac;

        try {
            hmac = crypto.createHmac(parts[0], repo.secret);
        } catch(e) {
            return next(e);
        }

        hmac.on('readable', () => {
            var data = hmac.read();
            if(data) {
                var digest = data.toString('hex');
                if(data.toString('hex') != parts[1]) {
                    return next(new Error("Bad secret"));
                }
                next();
            }
        });

        req.pipe(hmac);
    },
    'simple': function(req, repo, next) {

        var secret = req.headers['x-push-secret'];

        if(secret === undefined) {
            return next(new Error("No push secret given"));
        }

        if(secret != repo.secret) {
            return next(new Error("Bad push secret"));
        }
        
        next();
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

// list apps
app.get('/apps', auth, function(req, res) {
    res.send(pushback.config.repos);
});

// manually deploy an app
app.get('/apps/:name/deploy', auth, function(req, res) {
    pushback.deploy(req.params.name, (err, output) => {
        if(err) {
            return res.status(400).send({error: err.message, output});
        }
        res.send({message: "Deploy successful", output});
    });
});

// deploy an app using a provider
app.post('/apps/:name/deploy', function(req, res) {

    try {
        var repo = pushback.getRepo(req.params.name);
    } catch(e) {
        return res.status(404).send({error: "No such repo"});
    }

    var providerName = repo.provider || 'github';
    var provider = providers[providerName];
    if(!provider) {
        return res.status(500).send({error: "No such provider: " + providerName});
    }

    provider(req, repo, (err) => {
        if(err) return setTimeout(() => {
            res.status(403).send({error: err.message}); 
        }, 1000);

        pushback.deploy(repo, (err, output) => {
            // only give away minimal details
            if(err) {
                return res.status(400).send({error: "Error deploying - see logs for details"});
            }
            res.send({message: "Deployed successfully"});
        });
    });

});

// create a new app
app.post('/apps/:name', auth, function(req, res) {

    var name = req.params.name;

    var c = concat((raw) => {
        try {
            var data = JSON.parse(raw);

            if(!data.repo) {
                throw new Error("Missing info");
            }


        } catch(e) {
            return res.status(400).send({error: e.message});
        }
        
        pushback.clone(name, data.repo, (err) => {
            if(err) return res.status(500).send({error: err.message});
            res.send({message: name + " created"});
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

