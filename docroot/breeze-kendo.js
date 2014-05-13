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
            console.log("READ", options);
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
            console.log("CREATE", options);
        },
        update: function(options) {
            console.log("UPDATE", options);
        },
        destroy: function(options) {
            console.log("DESTROY", options);
        },

        _makeResults: function(data) {
            var meta, typeObj, typeName;

            try {
                meta = this.manager.metadataStore;
                typeName = meta.getEntityTypeNameForResourceName(this.query.resourceName);
                typeObj = meta.getEntityType(typeName);
            } catch(ex) {
                // without metadata Breeze returns plain JS objects
                // so we can just return the original array.
                data.results.total = data.inlineCount;
                return data.results;
            }

            // with the metadata, some complex objects are returned,
            // and ObservableArray will overrun the stack trying to
            // walk it, so we must do the conversion ourselves.

            var props = typeObj.dataProperties;
            var a = data.results.map(function(rec){
                var obj = {};
                props.forEach(function(prop){
                    obj[prop.name] = rec[prop.name];
                });
                obj = new kendo.data.ObservableObject(obj);
                var locked = false;
                function protect(f) {
                    return function() {
                        if (!locked) {
                            locked = true;
                            try { f.apply(this, arguments) }
                            finally { locked = false }
                        }
                    };
                }
                obj.bind({
                    "change": protect(function(ev){
                        if (ev.field) {
                            rec[ev.field] = obj[ev.field];
                        } else {
                            console.error("Unhandled ObservableObject->Breeze change event", ev);
                        }
                    }),
                    "destroy": function(ev) {
                        rec.entityAspect.setDeleted();
                    }
                });
                rec.entityAspect.propertyChanged.subscribe(protect(function(ev){
                    obj.set(ev.propertyName, ev.newValue);
                }));
                obj.__breezeEntity = rec;
                return obj;
            });

            a = new kendo.data.ObservableArray(a);
            a.bind("change", function(ev){
                console.log(ev);
                switch (ev.action) {
                  case "remove":
                    break;
                  case "add":
                    break;
                }
            });
            a.total = data.inlineCount;
            return a;
        }
    });

    exports.Source = kendo.data.DataSource.extend({
        init: function(options) {
            options = $.extend({}, {
                transport: new BreezeTransport(options),
                schema: {
                    total: function(data) {
                        // XXX: wish this could be inserted from the transport.
                        return data.total;
                    }
                }
            }, options);
            kendo.data.DataSource.prototype.init.call(this, options);
        }
    });

})(jQuery, kendo, breeze);
