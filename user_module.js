
var crypto = require('crypto');
var MongoDB = require('mongodb').Db;
var Server = require('mongodb').Server;
var moment = require('moment');

/*
	ESTABLISH DATABASE CONNECTION
*/

var dbName = process.env.DB_NAME || 'drawing';
var dbHost = process.env.DB_HOST || 'localhost'
var dbPort = process.env.DB_PORT || 27017;

var db = new MongoDB(dbName, new Server(dbHost, dbPort, { auto_reconnect: true }), { w: 1 });
db.open(function (e, d) {
    if (e) {
        console.log(e);
    } else {
        if (process.env.NODE_ENV == 'live') {
            db.authenticate(process.env.DB_USER, process.env.DB_PASS, function (e, res) {
                if (e) {
                    console.log('mongo :: error: not authenticated', e);
                }
                else {
                    console.log('mongo :: authenticated and connected to database :: "' + dbName + '"');
                }
            });
        } else {
            console.log('mongo :: connected to database :: "' + dbName + '"');
        }
    }
});

var accounts = db.collection('accounts');
var jobs = db.collection('jobs');

/* login validation methods */

exports.autoLogin = function (user, pass, callback) {
    accounts.findOne({ user: user }, function (e, o) {
        if (o) {
            o.pass == pass ? callback(o) : callback(null);
        } else {
            callback(null);
        }
    });
}

exports.manualLogin = function (user, pass, callback) {
    accounts.findOne({ user: user }, function (e, o) {
        if (o == null) {
            callback('user-not-found');
        } else {
            validatePassword(pass, o.pass, function (err, res) {
                if (res) {
                    callback(null, o);
                } else {
                    callback('invalid-password');
                }
            });
        }
    });
}

/* record insertion, update & deletion methods */

exports.addNewAccount = function (newData, callback) {
    console.log(newData);
    
    accounts.findOne({ user: newData.user }, function (e, o) {
        if (o) {
            callback('username-taken');
        } else {
            accounts.findOne({ email: newData.email }, function (e, o) {
                if (o) {
                    callback('email-taken');
                } else {
                    saltAndHash(newData.pass, function (hash) {
                        newData.pass = hash;
                        // append date stamp when record was created //
                        newData.date = moment().format('MMMM Do YYYY, h:mm:ss a');
                        accounts.insert(newData, { safe: true }, callback);
                    });
                }
            });
        }
    });
}

exports.updateAccount = function (newData, callback) {
    accounts.findOne({ _id: getObjectId(newData._id) }, function (e, o) {

        o.firstname = newData.firstname;
        o.lastname = newData.lastname;
        o.email = newData.email;
        o.address = newData.address;
        o.cell = newData.cell;
        o.city = newData.city;
        o.cross_streets1 = newData.cross_streets1;
        o.cross_streets2 = newData.cross_streets2;
        o.phone = newData.phone;
        o.state = newData.state;
        o.salesperson1 = newData.salesperson1;
        o.salesperson2 = newData.salesperson2;
        o.zip = newData.zip;
        if (newData.pass == '') {
            accounts.save(o, { safe: true }, function (e) {
                if (e) callback(e);
                else callback(null, o);
            });
        } else {
            saltAndHash(newData.pass, function (hash) {
                // o.pass = hash;
                accounts.save(o, { safe: true }, function (e) {
                    if (e) callback(e);
                    else callback(null, o);
                });
            });
        }
    });
}

exports.updatePassword = function (email, newPass, callback) {
    accounts.findOne({ email: email }, function (e, o) {
        if (e) {
            callback(e, null);
        } else {
            saltAndHash(newPass, function (hash) {
                o.pass = hash;
                accounts.save(o, { safe: true }, callback);
            });
        }
    });
}

/* account lookup methods */

exports.deleteAccount = function (id, callback) {
    accounts.remove({ _id: getObjectId(id) }, callback);
}

exports.getAccountByEmail = function (email, callback) {
    accounts.findOne({ email: email }, function (e, o) { callback(o); });
}

exports.validateResetLink = function (email, passHash, callback) {
    accounts.find({ $and: [{ email: email, pass: passHash }] }, function (e, o) {
        callback(o ? 'ok' : null);
    });
}

exports.getAllRecords = function (callback) {
    accounts.find().toArray(
        function (e, res) {
            if (e) callback(e)
            else callback(null, res)
        });
}

exports.delAllRecords = function (callback) {
    accounts.remove({}, callback); // reset accounts collection for testing //
}

/* private encryption & validation methods */

var generateSalt = function () {
    var set = '0123456789abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQURSTUVWXYZ';
    var salt = '';
    for (var i = 0; i < 10; i++) {
        var p = Math.floor(Math.random() * set.length);
        salt += set[p];
    }
    return salt;
}

var md5 = function (str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

var saltAndHash = function (pass, callback) {
    var salt = generateSalt();
    callback(salt + md5(pass + salt));
}

var validatePassword = function (plainPass, hashedPass, callback) {
    var salt = hashedPass.substr(0, 10);
    var validHash = salt + md5(plainPass + salt);
    callback(null, hashedPass === validHash);
}

var getObjectId = function (id) {
    return new require('mongodb').ObjectID(id);
}

var findById = function (id, callback) {
    accounts.findOne({ _id: getObjectId(id) },
        function (e, res) {
            if (e) callback(e)
            else callback(null, res)
        });
}

var findByMultipleFields = function (a, callback) {
    // this takes an array of name/val pairs to search against {fieldName : 'value'} //
    accounts.find({ $or: a }).toArray(
        function (e, results) {
            if (e) callback(e)
            else callback(null, results)
        });
}

exports.addNewJob = function (newData, callback) {
    newData.date = moment().format('MMMM Do YYYY, h:mm:ss a');
    jobs.insert(newData, { safe: true }, callback);
}

exports.jobsByUser = function (user_id, callback) {
    jobs.find({ 'user_id': user_id }).toArray( //findOne({_id: getObjectId(user_id)},
        function (e, res) {
            if (e) callback(e)
            else callback(null, res)
        });
}

exports.alljobs = function (callback) {
    jobs.find().toArray( //findOne({_id: getObjectId(user_id)},
        function (e, res) {
            if (e) callback(e)
            else callback(null, res)
        });
}

exports.searchjobs = function (searchdata, callback) {
    jobs.find(searchdata).toArray( //findOne({_id: getObjectId(user_id)},
        function (e, res) {
            if (e) callback(e)
            else callback(null, res)
        });
}