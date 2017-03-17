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

Pushback.prototype.deploy = function(name, cb) {
    debug("%s: Update in progress", name);
    const output = [];
    var repo = this.config.repos[name];

    if(!repo) {
        debug("%s: no such repo", name);
        return cb(new Error("No such repo"));
    }
    debug("%s: repo %j", name, repo);

    if(!repo.path) {
        debug("%s: path not set", name);
        return cb(new Error("No path for repo"));
    }
    const cwd = path.resolve(repo.path);

    commands = [];
    if(repo.preDeploy) commands = commands.concat(stringArray(repo.preDeploy));
    commands.push(repo.pull || 'git pull');
    if(repo.postDeploy) commands = commands.concat(stringArray(repo.postDeploy));

    const options = {cwd};
    debug("%s: options %j", name, options);

    async.eachSeries(commands, (command, next) => {
        debug("%s: Executing %j", name, command);
        exec(command, options, (err, stdout, stderr) => {
            output.push({command, stdout, stderr});
            next(err);
        });
    }, (err) => {
        if(err) {
            console.error(err);
            cb(err, output);
        }
        debug("%s: Update successfull", name);
        cb(null, output);
    });

}

module.exports = Pushback;
