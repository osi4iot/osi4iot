import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { FeatureCollection } from 'geojson';


export interface IOrgOfGroupsManaged {
    id: number;
    name: string;
    acronym: string;
    address: string;
    city: string;
    zipCode: string;
    state: string;
    country: string;
    latitude: number;
    longitude: number;
    geoJsonData: FeatureCollection;
    buildingId: number;
    orgHash: string;
    mqttAccessControl: string;
}


export const ORGS_OF_GROUPS_MANAGED_COLUMNS: Column<IOrgOfGroupsManaged>[] = [
    {
        Header: "Id",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "Name",
        accessor: "name",
    },
    {
        Header: "Acronym",
        accessor: "acronym"
    },
    {
        Header: "Address",
        accessor: "address",
        disableFilters: true,
    },
    {
        Header: "City",
        accessor: "city",
        disableFilters: true,
    },
    {
        Header: "Zip code",
        accessor: "zipCode",
        disableFilters: true,
    },
    {
        Header: "State",
        accessor: "state",
        disableFilters: true
    },
    {
        Header: "Country",
        accessor: "country",
        disableFilters: true
    },
    {
        Header: "Building_Id",
        accessor: "buildingId",
        disableFilters: true
    }
];
