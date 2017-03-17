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
            console.log(repo.secret);
            hmac = crypto.createHmac(parts[0], repo.secret);
        } catch(e) {
            return next(e);
        }

        hmac.on('readable', () => {
            var data = hmac.read();
            if(data) {
                var digest = data.toString('hex');
                console.log(digest, parts[1]);
                if(data.toString('hex') != parts[1]) {
                    return next(new Error("Bad secret"));
                }
                next();
            }
        });

        req.pipe(hmac);
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

app.post('/create', auth, function(req, res) {
    var c = concat((raw) => {
        try {
            var data = JSON.parse(raw);

            if(!data.repo || !data.name) {
                throw new Error("Missing info");
            }


        } catch(e) {
            return res.status(400).send({error: e.message});
        }
        
        pushback.clone(data.name, data.repo, (err) => {
            if(err) return res.status(500).send({error: err.message});
            res.send({message: data.name + " created"});
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

