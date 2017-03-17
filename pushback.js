const path = require('path');
const exec = require('child_process').exec;
const async = require('async');
const debug = console.error;

function stringArray(s) {
    if(typeof(s) == 'string') return [s];
    return s;
}

function Pushback(config) {

    if(!config.basePath) throw new Error("basePath not set");

    Object.keys(config.repos).map((k) => {
        config.repos[k].name = k;
    });

    this.config = config;
}

Pushback.prototype.getRepo = function(name) {
    if(this.config.repos[name] === undefined) throw new Error("No such repo");
    return this.config.repos[name];
}

Pushback.prototype.deploy = function(repo, cb) {


    if(typeof(repo) == 'string') {
        try {
            repo = this.getRepo(repo);
        } catch(e) {
            return cb(e);
        }
    }

    debug("Update in progress for %s", repo.name);
    const output = [];

    var cwd;

    if(repo.path) {
        cwd = path.resolve(repo.path);
    } else {
        cwd = path.join(this.config.basePath, repo.name);
    }

    commands = [];
    if(repo.preDeploy) commands = commands.concat(stringArray(repo.preDeploy));
    commands.push(repo.pull || 'git pull');
    if(repo.postDeploy) commands = commands.concat(stringArray(repo.postDeploy));

    const options = {cwd};
    debug("%s: options %j", repo.name, options);

    async.eachSeries(commands, (command, next) => {
        debug("%s: Executing %j", repo.name, command);
        exec(command, options, (err, stdout, stderr) => {
            output.push({command, stdout, stderr});
            next(err);
        });
    }, (err) => {
        if(err) {
            console.error(err);
            cb(err, output);
            return;
        }
        debug("%s: Update successful", repo.name);
        cb(null, output);
    });

}

Pushback.prototype.clone = function(name, repo, cb) {
    debug("Creating app %s", name);

    if(!this.config.basePath) return cb(new Error("basePath not set"));

    options = {cwd: this.config.basePath};
    exec(`git clone ${repo} ${name}`, options, (err, stdout, stderr) => {
        if(err) {
            console.error(err);
            return cb(err);
        }
        cb(null, stdout);
    }); 
}

module.exports = Pushback;
