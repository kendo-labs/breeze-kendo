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

## Features

- creates a Kendo DataSource object that is kept in sync with the
  Breeze entities.  For instance when an entity changes, the Kendo DS
  is updated automatically; also when the data changes on the Kendo
  side, the Breeze entities are updated automatically.

  This means that for an app that is properly configured to use Breeze
  (i.e. has metadata and breezeManager.saveChanges() works) adding in
  Kendo widgets should be a snap.

  (XXX: create/update/destroy not yet completed in the transport, but
  that's too easy; fighting with another bug right now.)

- auto-generates a Kendo-compatible data model (`schema.model`) based
  on metadata defined in the Breeze EntityManager.

- supports server-side pagination, sort, filters.

The code is defined in `docroot/breeze-kendo.js`.

See the usage in `docroot/test.js` and `docroot/index.html`.
