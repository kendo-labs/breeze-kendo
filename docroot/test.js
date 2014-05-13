var dataService = new breeze.DataService({
    serviceName       : "/",
    hasServerMetadata : false,
});

var metadataStore = new breeze.MetadataStore({
    namingConvention: breeze.camelCaseConvention
});

metadataStore.importMetadata(window.METADATA);

var manager = new breeze.EntityManager({
    dataService   : dataService,
    metadataStore : metadataStore,
    // saveOptions   : new breeze.SaveOptions({
    //     resourceName : "/SaveChanges"
    // })
});

var dataSource = new kendo.data.breeze.Source({
    manager: manager,
    query: breeze.EntityQuery.from("Customers"),
    serverSorting: true,
    serverPaging: true,
    serverFiltering: true,
    pageSize: 10,
});

$("#grid").kendoGrid({
    columns: [
        { field: "CustomerID", width: 150 },
        { field: "ContactName" },
        { command: "destroy", width: 90 }
    ],
    dataSource: dataSource,
    filterable: true,
    groupable: true,
    sortable: true,
    pageable: true,
    selectable: true,
    editable: true,

    change: function(ev) {
        console.log(this.dataSource.getByUid(this.select().attr(kendo.attr("uid"))));
    }
});
