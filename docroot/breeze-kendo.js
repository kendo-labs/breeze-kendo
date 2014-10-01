(function($, kendo, breeze){

    var exports = kendo.data.breeze = {};
    var Predicate = breeze.Predicate;
    var Operators = breeze.FilterQueryOp;

    function BreezeTransport(options) {
        if (!options.manager) {
            throw new Error("Please specify a Breeze EntityManager via `manager` option");
        }
        if (!options.query) {
            throw new Error("Please specify a Breeze EntityQuery via `query` option");
        }
        this.manager = options.manager;
        this.query = options.query;
    }
	
	function recursiveIteration(object, callback, prefix) {
        for (var property in object) {
            if (object.hasOwnProperty(property)) {
                if (typeof object[property] == "object") {
                    recursiveIteration(object[property], callback, (prefix || '') + property + '.');
                } else {
                    callback(object, (prefix || '') + property);
                }
            }
        }
    }

    function makeOperator(op) {
        return {
            eq         : Operators.Equals,
            neq        : Operators.NotEquals,
            lt         : Operators.LessThan,
            lte        : Operators.LessThanOrEqual,
            gt         : Operators.GreaterThan,
            gte        : Operators.GreaterThanOrEqual,
            startswith : Operators.StartsWith,
            endswith   : Operators.EndsWith,
            contains   : Operators.Contains,
        }[op];
    }

    function makeFilters(args) {
        var filters = args.filters.map(function(f){
            var field = f.field;
            var operator = makeOperator(f.operator);
            var value = f.value;
            return Predicate.create(field, operator, value);
        });
        if (args.logic == "and") return Predicate.and(filters);
        if (args.logic == "or") return Predicate.or(filters);
        throw new Error("Unsupported predicate logic " + args.logic);
    }

    $.extend(BreezeTransport.prototype, {
        read: function(options) {
            var self = this;
            //console.log("READ", options);
            var query = self.query;
            var args = options.data;
            if (args.filter) {
                query = query.where(makeFilters(args.filter));
            }
            if (args.sort && args.sort.length > 0) {
                query = query.orderBy(args.sort.map(function(col){
                    return col.field + (col.dir == "desc" ? " desc" : "");
                }).join(", "));
            }
            if (args.page) {
                query = query
                    .skip(args.skip)
                    .take(args.take)
                    .inlineCount();
            }
            try {
                self.manager.executeQuery(query).then(function(data){
                    options.success(self._makeResults(data));
                }).fail(function(err){
                    options.error(err);
                });
            } catch(ex) {
                console && console.error && console.error(ex);
            }
        },
        create: function(options) {
            //console.log("CREATE", options);
            this._saveChanges();
        },
        update: function(options) {
            //console.log("UPDATE", options);
            this._saveChanges();
        },
        destroy: function(options) {
            //console.log("DESTROY", options);
            this._saveChanges();
        },

        _saveChanges: (function(){
            // throttle, since we will get multiple calls even in
            // "batch" mode.
            var timer = null;
            return function() {
                var self = this;
                clearTimeout(timer);
                setTimeout(function(){
                    self.manager.saveChanges();
                }, 10);
            };
        })(),

        _cancelChanges: function (dataItem) {
            var manager = this.manager;
            if (dataItem && dataItem.__breezeEntity) {
                dataItem.__breezeEntity.rejectChanges();
            } else {
                manager.rejectChanges();
            }
        },

        _makeResults: function(data) {
            var manager = this.manager;
            var query = this.query;

            try {
                var meta = manager.metadataStore;
                var typeName = meta.getEntityTypeNameForResourceName(query.resourceName);
                var typeObj = meta.getEntityType(typeName || query.resourceName);
            } catch(ex) {
                // without metadata Breeze returns plain JS objects
                // so we can just return the original array.
                data.results.total = data.inlineCount;
                return data.results;
            }

            // let's get (or try to get) the schema
            // and create a correct model, so that things like
            // isNew() work
            var schema = this._makeSchema();

            // with the metadata, some complex objects are returned on
            // which we can't call ObservableArray/Object (would
            // overrun the stack).

            var props = typeObj.dataProperties;
            var navs = typeObj.navigationProperties;
            var a = data.results.map(function(rec){
                var obj = {};
                props.forEach(function(prop){
                    obj[prop.name] = rec[prop.name];
                });

                // handle nav properties - only allows 1 level currently
                navs.forEach(function(nav) {
                    var navProps = nav.entityType.dataProperties;
                    
                    if (!!rec[nav.name]) {
                        var navObj = {};
                        var navRec = rec[nav.name];

                        navProps.forEach(function (navProp) {
                            navObj[navProp.name] = navRec[navProp.name];
                        });

                        obj[nav.name] = navObj;
                    }
                });

                // bind to the schema if available
                if (schema && schema.model) {
                    var schemaModel = kendo.data.Model.define(schema.model);
                    obj = new schemaModel(obj);
                } else {
                    obj = new kendo.data.Model(obj);
                }

                syncItems(obj, rec);
                return obj;
            });

            a = new kendo.data.ObservableArray(a);
            a.bind("change", function(ev){
                switch (ev.action) {
                  case "remove":
                    ev.items.forEach(function(item){
                        item.__breezeEntity.entityAspect.setDeleted();
                    });
                    break;
                  case "add":
                    ev.items.forEach(function(item){
                        var entity = manager.createEntity(typeName || query.resourceName, item);
                        manager.addEntity(entity);
                        syncItems(item, entity);
                    });
                    break;
                }
            });
            a.total = data.inlineCount;
            return a;
        },

        _makeSchema: function() {
            var schema = {
                total: function(data) {
                    return data.total;
                }
            };
            try {
                var meta = this.manager.metadataStore;
                var typeName = meta.getEntityTypeNameForResourceName(this.query.resourceName);
                var typeObj = meta.getEntityType(typeName || this.query.resourceName);
            } catch(ex) {
                return schema;
            }
            var model = { fields: {} };
            if (typeObj.keyProperties) {
                if (typeObj.keyProperties.length == 1) {
                    model.id = typeObj.keyProperties[0].name;
                } else if (typeObj.keyProperties.length > 1) {
                    console && console.error && console.error("Multiple-key ID not supported");
                }
            }
            
            try {
                typeObj.dataProperties.forEach(function(prop){
                    var proptype = "string";
                    if (prop.dataType.isNumeric) {
                        proptype = "number";
                    }
                    else if (prop.dataType.isDate) {
                        proptype = "date";
                    }
                    else if (prop.dataType.name == "Boolean") {
                        proptype = "boolean";
                    }
                    model.fields[prop.name] = {
                        type: proptype,
                        defaultValue : prop.defaultValue,
                        nullable:      prop.isNullable,
                        required:      prop.isNullable
                    };
                });
                
                var navs = typeObj.navigationProperties;

                navs.forEach(function(nav) {
                    var navProps = nav.entityType.dataProperties;

                    /* TODO: Figure out how to map complex properties for the schema...
                    
                        Out of the box, Kendo DataSource does not support this in it's schema
                        An option includes potentially turning all related properties into
                        Nav_Property instead of Nav.Property, but this would require
                        Changes to the entirety of the transport to override mapping both
                        forward and back.
                    */
                });


            } catch (ex) {
                return schema;
            }

            schema.model = model;
            return schema;
        }
    });

    exports.Source = kendo.data.DataSource.extend({
        init: function(options) {
            var transport = new BreezeTransport(options);
            options = $.extend({}, {
                transport : transport,
                schema    : transport._makeSchema(),
                batch     : true,
            }, options);
            kendo.data.DataSource.prototype.init.call(this, options);

        },
        cancelChanges: function (e) {
            var t = this;

            if (e instanceof kendo.data.Model) {
                t._cancelModel(e);
                t.transport._cancelChanges(e);
            } else {
                t._destroyed = [],
                t._detachObservableParents(),
                t._data = t._observe(t._pristineData),
                t.options.serverPaging && (t._total = t._pristineTotal);
                t._change();
                t.transport._cancelChanges();
            }
        },
    });

    function syncItems(observable, entity) {
        var protect = Mutex();
        observable.bind({
            "change": protect(function(ev){
                if (ev.field) {
                    entity[ev.field] = observable[ev.field];
                } else {
                    console && console.error && console.error("Unhandled ObservableObject->Breeze change event", ev);
                }
            })
        });
        entity.entityAspect.propertyChanged.subscribe(protect(function (ev) {

            if (ev.propertyName) {
                observable.set(ev.propertyName, ev.newValue);
            } else if (ev.entity) {
                recursiveIteration(ev.entity._backingStore, function(obj, prop) {
                    observable.set(prop, obj[prop]);
                });
            }
        }));
        observable.__breezeEntity = entity;
    }

    function Mutex() {
        var locked = false;
        return function(f) {
            return function() {
                if (!locked) {
                    locked = true;
                    try { f.apply(this, arguments) }
                    finally { locked = false }
                }
            };
        };
    }

})(jQuery, kendo, breeze);
