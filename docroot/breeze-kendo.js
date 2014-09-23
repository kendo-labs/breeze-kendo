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
                console.error(ex);
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

        _makeResults: function(data) {
            var manager = this.manager;

            try {
                var meta = manager.metadataStore;
                var typeName = meta.getEntityTypeNameForResourceName(this.query.resourceName);
                var typeObj = meta.getEntityType(typeName || this.query.resourceName);
            } catch(ex) {
                // without metadata Breeze returns plain JS objects
                // so we can just return the original array.
                data.results.total = data.inlineCount;
                return data.results;
            }

            // with the metadata, some complex objects are returned on
            // which we can't call ObservableArray/Object (would
            // overrun the stack).

            var props = typeObj.dataProperties;
            var a = data.results.map(function(rec){
                var obj = {};
                props.forEach(function(prop){
                    obj[prop.name] = rec[prop.name];
                });
                obj = new kendo.data.Model(obj);
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
                        var entity = manager.createEntity(typeName, item);
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
                    console.error("Multiple-key ID not supported");
                }
            }
            
            typeObj.dataProperties.forEach(function(prop){
                var type = "string";
                if (prop.dataType.isNumeric) {
                    type = "number";
                }
                else if (prop.dataType.isDate) {
                    type = "date";
                }
                else if (prop.dataType.name == "Boolean") {
                    type = "boolean";
                }
                model.fields[prop.name] = {
                    type         : type,
                    defaultValue : prop.defaultValue,
                    nullable     : prop.isNullable,
                };
            });
			
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
        }
    });

    function syncItems(observable, entity) {
        var protect = Mutex();
        observable.bind({
            "change": protect(function(ev){
                if (ev.field) {
                    entity[ev.field] = observable[ev.field];
                } else {
                    console.error("Unhandled ObservableObject->Breeze change event", ev);
                }
            })
        });
        entity.entityAspect.propertyChanged.subscribe(protect(function(ev){
            observable.set(ev.propertyName, ev.newValue);
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
