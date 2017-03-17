const path = require('path');
const exec = require('child_process').exec;
const async = require('async');
const debug = require('debug')('pushback');

function stringArray(s) {
    if(typeof(s) == 'string') return [s];
    return s;
}

function Pushback(config) {
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

    debug("Update in progress");
    const output = [];

    debug("repo %j", repo);

    if(!repo.path) {
        debug("path not set");
        return cb(new Error("No path for repo"));
    }
    const cwd = path.resolve(repo.path);

    commands = [];
    if(repo.preDeploy) commands = commands.concat(stringArray(repo.preDeploy));
    commands.push(repo.pull || 'git pull');
    if(repo.postDeploy) commands = commands.concat(stringArray(repo.postDeploy));

    const options = {cwd};
    debug("options %j", options);

    async.eachSeries(commands, (command, next) => {
        debug("Executing %j", command);
        exec(command, options, (err, stdout, stderr) => {
            output.push({command, stdout, stderr});
            next(err);
        });
    }, (err) => {
        if(err) {
            console.error(err);
            cb(err, output);
        }
        debug("Update successful");
        cb(null, output);
    });

}

module.exports = Pushback;
