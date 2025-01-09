const NodeHelper = require("node_helper");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");


module.exports = NodeHelper.create({
    start: function () {
        this.apiBase = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm";
        console.log("Starting node helper for" + this.name);
        this.stopIdMap = new Map([
            ["D43N", "Coney Island-Stillwell Av"],
            ["B23N", "Bay 50 St"],
            ["B22N", "25 Av"],
            ["B21N", "Bay Pkwy"],
            ["B20N", "20 Av"],
            ["B19N", "18 Av"],
            ["B18N", "79 St"],
            ["B17N", "71 St"], 
            ["B16N", "62 St"],
            ["B15N", "55 St"],
            ["B14N", "50 St"],
            ["B13N", "Fort Hamilton Pkwy"],
            ["B12N", "9 Av"],
            ["R36N", "36 St"],
            ["R31N", "Atlantic Av-Barclays Ctr"], 
            ["D22N", "Grand St"], 
            ["D21N", "Broadway-Lafayette St"], 
            ["D20N", "W 4 St-Wash Sq"], 
            ["D17N", "34 St-Herald Sq"], 
            ["D16N", "42 St-Bryant Pk"], 
            ["D15N", "47-50 Sts-Rockefeller Ctr"], 
            ["D14N", "7 Av"], 
            ["A24N", "59 St-Columbus Circle"], 
            ["A22N", "72 St"], 
            ["A21N", "81 St-Museum of Natural History"], 
            ["A20N", "86 ST"], 
            ["A19N", "96 St"], 
            ["A18N", "103 St"], 
            ["A17N", "Cathedral Pkwy (110 St)"], 
            ["A16N", "116 St"], 
            ["A15N", "125 ST"], 
            ["D13N", "145 St"], 
            ["D12N", "155 St"], 
            ["D11N", "161 St-Yankee Stadium"], 
            ["D10N", "167 St"], 
            ["D09N", "180 St"], 
            ["D08N", "174-175 Sts"], 
            ["D07N", "Tremont Av"], 
            ["D06N", "182-183 StS"], 
            ["D05N", "Fordham Rd"], 
            ["D04N", "Kingsbridge Rd"], 
            ["D03N", "Bedford Park Blvd"], 
            ["D01N", "Norwood-205 St"]
        ])
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "GET_TRAIN_STATUS") {
            this.getTrainStatus()
                .then((futureArrivals) => {
                    this.sendSocketNotification("TRAIN_STATUS", futureArrivals);
                })
                .catch((error) => {
                    console.error("Error fetching train status:", error);
                });
        }
    },

    getTrainStatus: async function () {
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
                if (entity.tripUpdate && this.isNorthboundDTrain(entity.tripUpdate)) {
                    const stopTimeUpdates = entity.tripUpdate.stopTimeUpdate;
                    
                    let stopArrivalTime = null;
                    let lastStop = null;

                    for (let update of stopTimeUpdates) {
                        if (update.stopId == "B18N") {
                            stopArrivalTime = update.arrival.time;
                        };
                    };

                    if (stopArrivalTime) {
                        lastStop = this.stopIdMap.get(stopTimeUpdates[stopTimeUpdates.length - 1].stopId);
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

    isNorthboundDTrain: function (tripUpdate) {
        const isDTrain = tripUpdate.trip.routeId === "D";
        const isNorthbound = this.parseTripDirection(tripUpdate.trip.tripId) === "North";

        return isDTrain && isNorthbound
    },
});