const NodeHelper = require("node_helper");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");


module.exports = NodeHelper.create({
    start: function () {
        this.apiBase = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm";
        console.log("Starting node helper for" + this.name);
        this.stopIdMap = new Map([
            ["D43", ["D43N", "D43S"]],
            ["B23", ["B23N", "B23S"]],
            ["B22", ["B22N", "B22S"]],
            ["B21", ["B21N", "B21S"]],
            ["B20", ["B20N", "B20S"]],
            ["B19", ["B19N", "B19S"]],
            ["B18", ["B18N", "B18S"]],
            ["B17", ["B17N", "B17S"]],
            ["B16", ["B16N", "B16S"]],
            ["B15", ["B15N", "B15S"]],
            ["B14", ["B14N", "B14S"]],
            ["B13", ["B13N", "B13S"]],
            ["B12", ["B12N", "B12S"]],
            ["R36", ["R36N", "R36S"]],
            ["R31", ["R31N", "R31S"]],
            ["D22", ["D22N", "D22S"]],
            ["D21", ["D21N", "D21S"]],
            ["D20", ["D20N", "D20S"]],
            ["D17", ["D17N", "D17S"]],
            ["D16", ["D16N", "D16S"]],
            ["D15", ["D15N", "D15S"]],
            ["D14", ["D14N", "D14S"]],
            ["A24", ["A24N", "A24S"]],
            ["A22", ["A22N", "A22S"]],
            ["A21", ["A21N", "A21S"]],
            ["A20", ["A20N", "A20S"]],
            ["A19", ["A19N", "A19S"]],
            ["A18", ["A18N", "A18S"]],
            ["A17", ["A17N", "A17S"]],
            ["A16", ["A16N", "A16S"]],
            ["A15", ["A15N", "A15S"]],
            ["D13", ["D13N", "D13S"]],
            ["D12", ["D12N", "D12S"]],
            ["D11", ["D11N", "D11S"]],
            ["D10", ["D10N", "D10S"]],
            ["D09", ["D09N", "D09S"]],
            ["D08", ["D08N", "D08S"]],
            ["D07", ["D07N", "D07S"]],
            ["D06", ["D06N", "D06S"]],
            ["D05", ["D05N", "D05S"]],
            ["D04", ["D04N", "D04S"]],
            ["D03", ["D03N", "D03S"]],
            ["D01", ["D01N", "D01S"]],
        ])
        this.stopNameMap = new Map([
            ["D43", "Coney Island-Stillwell Av"],
            ["B23", "Bay 50 St"],
            ["B22", "25 Av"],
            ["B21", "Bay Pkwy"],
            ["B20", "20 Av"],
            ["B19", "18 Av"],
            ["B18", "79 St"],
            ["B17", "71 St"], 
            ["B16", "62 St"],
            ["B15", "55 St"],
            ["B14", "50 St"],
            ["B13", "Fort Hamilton Pkwy"],
            ["B12", "9 Av"],
            ["R36", "36 St"],
            ["R31", "Atlantic Av-Barclays Ctr"], 
            ["D22", "Grand St"], 
            ["D21", "Broadway-Lafayette St"], 
            ["D20", "W 4 St-Wash Sq"], 
            ["D17", "34 St-Herald Sq"], 
            ["D16", "42 St-Bryant Pk"], 
            ["D15", "47-50 Sts-Rockefeller Ctr"], 
            ["D14", "7 Av"], 
            ["A24", "59 St-Columbus Circle"], 
            ["A22", "72 St"], 
            ["A21", "81 St-Museum of Natural History"], 
            ["A20", "86 ST"], 
            ["A19", "96 St"], 
            ["A18", "103 St"], 
            ["A17", "Cathedral Pkwy (110 St)"], 
            ["A16", "116 St"], 
            ["A15", "125 ST"], 
            ["D13", "145 St"], 
            ["D12", "155 St"], 
            ["D11", "161 St-Yankee Stadium"], 
            ["D10", "167 St"], 
            ["D09", "180 St"], 
            ["D08", "174-175 Sts"], 
            ["D07", "Tremont Av"], 
            ["D06", "182-183 StS"], 
            ["D05", "Fordham Rd"], 
            ["D04", "Kingsbridge Rd"], 
            ["D03", "Bedford Park Blvd"], 
            ["D01", "Norwood-205 St"]
        ])
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "GET_TRAIN_STATUS") {
            const stopId = payload.stopId;
            const northBound = payload.northBound;
            const southBound = payload.southBound;
            this.getTrainStatus(stopId, northBound, southBound)
                .then((futureArrivals) => {
                    this.sendSocketNotification("TRAIN_STATUS", futureArrivals);
                })
                .catch((error) => {
                    console.error("Error fetching train status:", error);
                });
        } else if (notification === "GET_STOP_NAME") {
            const stopId = payload.stopId;
            const stopName = this.stopNameMap.get(stopId);
            this.sendSocketNotification("STOP_NAME", {stopId: stopId, stopName: stopName});
        }
    },

    getTrainStatus: async function (stopId, northBound, southBound) {
        try {
            const fetch = (await import("node-fetch")).default;
            const response = await fetch(this.apiBase);
            if (!response.ok) {
                const error = new Error(`${response.url}: ${response.status} ${response.statusText}`);
                error.response = response;
                throw error;
            }
            const buffer = await response.arrayBuffer();
            const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
            let futureArrivals = [];
            const now = Date.now();
            feed.entity.forEach((entity) => {
                if (entity.tripUpdate && this.isArrivingTrain(entity.tripUpdate, northBound, southBound)) {
                    const stopTimeUpdates = entity.tripUpdate.stopTimeUpdate;
                    let stopArrivalTime = null;
                    let lastStop = null;

                    for (let update of stopTimeUpdates) {
                        if (this.stopIdMap.get(stopId).includes(update.stopId)) {
                            stopArrivalTime = update.arrival.time;
                        };
                    };

                    if (stopArrivalTime) {
                        lastStop = this.stopNameMap.get(stopTimeUpdates[stopTimeUpdates.length - 1].stopId.slice(0, -1));
                    };
                    if (lastStop) {
                        futureArrivals.push({
                            "arrivalTime": stopArrivalTime.low * 1000,
                            "lastStop": lastStop
                        });
                    };
                }
            });
            return futureArrivals;
        }
        catch (error) {
            console.error(error);
            process.exit(1);
        }
    },

    parseTripDirection: function (tripId) {
        const pattern = /^\d{6}_D\.\.(S|N)/;
        const match = tripId.match(pattern);

        if (match) {
            const direction = match[1];
            return direction === "S" ? "South" : "North";
        };
        return null;
    },

    isArrivingTrain: function (tripUpdate, northBound, southBound) {
        const isDTrain = tripUpdate.trip.routeId === "D";
        const isNorthbound = this.parseTripDirection(tripUpdate.trip.tripId) === "North";
        
        let isArrivingTrain = false
        if (northBound && southBound) {
            isArrivingTrain = isDTrain
        } else if (northBound && !southBound) {
            isArrivingTrain = (isDTrain && isNorthbound)
        } else if (!northBound && southBound) {
            isArrivingTrain = (isDTrain && !isNorthbound)
        } 
        return isArrivingTrain;
    },
});