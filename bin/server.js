#! /usr/bin/env node

var PATH = require("path");
var EXPRESS = require("express");
var APP = EXPRESS();
var FS = require("fs");
var MONGODB = require('mongodb');
var BREEZE = require('breeze-mongodb');

var defhandler = (function(){
    var handlers = {};
    return function(verb, path, hdl) {
        var id = verb + path;
        if (!handlers[id]) {
            APP[verb](path, function(){
                return handlers[id].apply(this, arguments);
            });
        }
        handlers[id] = hdl;
    };
})();

var DBSERVER = new MONGODB.Server("localhost", 27017, {
    auto_reconnect: true
});

var DB = new MONGODB.Db("Northwind", DBSERVER, { strict: true, w: 1 });

DB.open(function(err){
    if (err) {
        throw new Error(err);
    }
    APP.listen(3000);
    console.log("Listening on port 3000");
});

APP.use(EXPRESS.bodyParser());
APP.use(EXPRESS.static(PATH.join(__dirname, "..", "docroot")));

defhandler("get", "/Metadata", function(req, res){
    res.setHeader("Content-Type", "application/json; charset=UTF-8");
    var metafile = PATH.join(__dirname, "..", "db", "Metadata.json");
    FS.readFile(metafile, "utf8", function(err, data){
        res.send(data);
    });
});

[
    "Categories",
    "Customers",
    "Employee_Territories",
    "Employees",
    "Northwind",
    "Order_Details",
    "Orders",
    "Products",
    "Regions",
    "Shippers",
    "Suppliers",
    "Territories",
].forEach(function(collection){
    defhandler("get", "/" + collection, function(req, res){
        collection = collection.toLowerCase().replace(/_/g, "-");
        var query = new BREEZE.MongoQuery(req.query);
        query.execute(DB, collection, processResults(res));
    });
});

defhandler("post", "/SaveChanges", function(req, res){
    var saveHandler = new BREEZE.MongoSaveHandler(DB, req.body, processResults(res));
    saveHandler.save();
});

function processResults(res) {
    return function(err, data) {
        if (err) {
            console.log(err);
            throw new Error(err);
        }
        res.setHeader("Content-Type", "application/json; charset: UTF-8");
        res.send(data);
    };
};
