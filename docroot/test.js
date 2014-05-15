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
});

var dataSource = new kendo.data.breeze.Source({
    manager: manager,
    query: breeze.EntityQuery.from("Products"),
    serverSorting: true,
    serverPaging: true,
    serverFiltering: true,
    pageSize: 10,
});

$("#grid").kendoGrid({
    toolbar: ["create", "save", "cancel"],
    columns: [
        "ProductName",
        { field: "UnitPrice", title: "Unit Price", format: "{0:c}", width: 110 },
        { field: "UnitsInStock", title: "Units In Stock", width: 110 },
        { field: "Discontinued", width: 110 },
        { command: "destroy", title: "&nbsp;", width: 90 }
    ],
    dataSource: dataSource,
    filterable: true,
    groupable: true,
    sortable: true,
    pageable: true,
    selectable: true,
    editable: true,

    change: function(ev) {
        window.item = this.dataSource.getByUid(this.select().attr(kendo.attr("uid")));
    }
});
