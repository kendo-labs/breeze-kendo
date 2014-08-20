# Note
Kendo UI Labs projects are experimental and largely built and supported by the community.  As such Telerik does not provide official support for any of the Kendo UI Labs projects via Telerik support agreements.  We do encourage you to open an issue or visit [Stack Overflow](http://www.stackoverflow.com).

# Setup

Install mongodb, i.e. `apt-get install mongodb`, or however it's done
on your OS.  We don't need the system-wide service, so we can stop it:

    sudo service mongodb stop
    sudo update-rc.d -f mongodb remove

Then:

    git clone https://github.com/kendo-labs/breeze-kendo2.git
    cd breeze-kendo2
    npm install
    mkdir db
    mongod --dbpath db

Open a new console.  To init the database:

    git clone https://github.com/mishoo/northwind-mongo.git
    cd northwind-mongo
    sh mongo-import.sh

To run the test page, `node bin/server.js` in the breeze-kendo2 dir,
and open http://localhost:3000/

"Save changes" is broken in this demo, seems due to a bug in
breeze-mongodb (watch the server console on "save").  The "save"
server-side handler appears to expect the request to provide a
metadata argument, but Breeze.js doesn't send it.  Any case, that's
not a bug of our wrappers, I suspect with a better server side (Breeze
seems to best support ASP.NET) it should work flawless.

## Features

- creates a Kendo DataSource object that is kept in sync with the
  Breeze entities.  For instance when an entity changes, the Kendo DS
  is updated automatically; also when the data changes on the Kendo
  side, the Breeze entities are updated automatically.

  This means that for an app that is properly configured to use Breeze
  (i.e. has metadata and breezeManager.saveChanges() works) adding in
  Kendo widgets that support a Kendo DataSource should be a snap.

- auto-generates a Kendo-compatible data model (`schema.model`) based
  on metadata defined in the Breeze EntityManager.

- supports server-side pagination, sort, filters.

## Usage

We assume your server is alredy configured for Breeze.js.

The code is defined in `docroot/breeze-kendo.js`.  Load it after Kendo
UI and Breeze:

```html
<script src=".../jquery.min.js"></script>
<script src=".../kendo.all.min.js"></script>
<script src=".../breeze.min.js"></script>
<script src="breeze-kendo.js"></script>
```

It defines `kendo.data.breeze.Source`, an object which inherits from
`kendo.data.DataSource` and can be used seamlessly with any widgets
that support the [DataSource
API](http://docs.telerik.com/kendo-ui/api/framework/datasource).  The
Breeze-specific options are `manager` (must be a breeze.EntityManager)
and `query` (a breeze.EntityQuery).  Example:

```js
var manager = new breeze.EntityManager(...);
var query = breeze.EntityQuery.from("Products");
var dataSource = new kendo.data.breeze.Source({
  manager         : manager,
  query           : query,
  serverSorting   : true,
  serverPaging    : true,
  serverFiltering : true,
  pageSize        : 10
});
```

The query you specify should return a list of rows with your data.
You can craft it any way you want, for example if you always want to
discard some rows you can say:

```js
var query = breeze.EntityQuery.from("Products")
                              .where("UnitPrice", "<", 10);
```

Now you can pass the `dataSource` to, say, a Grid widget:

```js
$("#grid").kendoGrid({
  dataSource : dataSource,
  filterable : true,
  sortable   : true,
  pageable   : true,
  editable   : true,
  toolbar    : ["create", "save", "cancel"]
});
```

Now pagination, sorting, filtering and even saving is entirely handled
by Breeze through our bindings.
