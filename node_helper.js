const NodeHelper = require("node_helper");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");


module.exports = NodeHelper.create({
    start: function () {
        this.apiBase = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm";
        console.log("Starting node helper for" + this.name);
        this.parentStops = {
            "A15": {"childStops": ["A15N", "A15S"], "stopName": "125 ST"},
            "A16": {"childStops": ["A16N", "A16S"], "stopName": "116 St"},
            "A17": {"childStops": ["A17N", "A17S"], "stopName": "Cathedral Pkwy (110 St)"},
            "A18": {"childStops": ["A18N", "A18S"], "stopName": "103 St"},
            "A19": {"childStops": ["A19N", "A19S"], "stopName": "96 St"},
            "A20": {"childStops": ["A20N", "A20S"], "stopName": "86 ST"},
            "A21": {"childStops": ["A21N", "A21S"], "stopName": "81 St-Museum of Natural History"},
            "A22": {"childStops": ["A22N", "A22S"], "stopName": "72 St"},
            "A24": {"childStops": ["A24N", "A24S"], "stopName": "59 St-Columbus Circle"},
            "B12": {"childStops": ["B12N", "B12S"], "stopName": "9 Av"},
            "B13": {"childStops": ["B13N", "B13S"], "stopName": "Fort Hamilton Pkwy"},
            "B14": {"childStops": ["B14N", "B14S"], "stopName": "50 St"},
            "B15": {"childStops": ["B15N", "B15S"], "stopName": "55 St"},
            "B16": {"childStops": ["B16N", "B16S"], "stopName": "62 St"},
            "B17": {"childStops": ["B17N", "B17S"], "stopName": "71 St"},
            "B18": {"childStops": ["B18N", "B18S"], "stopName": "79 St"},
            "B19": {"childStops": ["B19N", "B19S"], "stopName": "18 Av"},
            "B20": {"childStops": ["B20N", "B20S"], "stopName": "20 Av"},
            "B21": {"childStops": ["B21N", "B21S"], "stopName": "Bay Pkwy"},
            "B22": {"childStops": ["B22N", "B22S"], "stopName": "25 Av"},
            "B23": {"childStops": ["B23N", "B23S"], "stopName": "Bay 50 St"},
            "D01": {"childStops": ["D01N", "D01S"], "stopName": "Norwood-205 St"},
            "D03": {"childStops": ["D03N", "D03S"], "stopName": "Bedford Park Blvd"},
            "D04": {"childStops": ["D04N", "D04S"], "stopName": "Kingsbridge Rd"},
            "D05": {"childStops": ["D05N", "D05S"], "stopName": "Fordham Rd"},
            "D06": {"childStops": ["D06N", "D06S"], "stopName": "182-183 StS"},
            "D07": {"childStops": ["D07N", "D07S"], "stopName": "Tremont Av"},
            "D08": {"childStops": ["D08N", "D08S"], "stopName": "174-175 Sts"},
            "D09": {"childStops": ["D09N", "D09S"], "stopName": "180 St"},
            "D10": {"childStops": ["D10N", "D10S"], "stopName": "167 St"},
            "D11": {"childStops": ["D11N", "D11S"], "stopName": "161 St-Yankee Stadium"},
            "D12": {"childStops": ["D12N", "D12S"], "stopName": "155 St"},
            "D13": {"childStops": ["D13N", "D13S"], "stopName": "145 St"},
            "D14": {"childStops": ["D14N", "D14S"], "stopName": "7 Av"},
            "D15": {"childStops": ["D15N", "D15S"], "stopName": "47-50 Sts-Rockefeller Ctr"},
            "D16": {"childStops": ["D16N", "D16S"], "stopName": "42 St-Bryant Pk"},
            "D17": {"childStops": ["D17N", "D17S"], "stopName": "34 St-Herald Sq"},
            "D20": {"childStops": ["D20N", "D20S"], "stopName": "W 4 St-Wash Sq"},
            "D21": {"childStops": ["D21N", "D21S"], "stopName": "Broadway-Lafayette St"},
            "D22": {"childStops": ["D22N", "D22S"], "stopName": "Grand St"},
            "D25": {"childStops": ["D25N", "D25S"], "stopName": "7 Av"},
            "D26": {"childStops": ["D26N", "D26S"], "stopName": "Prospect Park"},
            "D28": {"childStops": ["D28N", "D28S"], "stopName": "Church Av"},
            "D31": {"childStops": ["D31N", "D31S"], "stopName": "Newkirk Plaza"},
            "D35": {"childStops": ["D35N", "D35S"], "stopName": "Kings Hwy"},
            "D39": {"childStops": ["D39N", "D39S"], "stopName": "Sheepshead Bay"},
            "D40": {"childStops": ["D40N", "D40S"], "stopName": "Brighton Beach"},
            "D43": {"childStops": ["D43N", "D43S"], "stopName": "Coney Island-Stillwell Av"},
            "R31": {"childStops": ["R31N", "R31S"], "stopName": "Atlantic Av-Barclays Ctr"},
            "R36": {"childStops": ["R36N", "R36S"], "stopName": "36 St"},
        };
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
            const stopName = this.parentStops[stopId]["stopName"];
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
                        if (this.parentStops[stopId]["childStops"].includes(update.stopId)) {
                            stopArrivalTime = update.arrival.time;
                        };
                    };

                    if (stopArrivalTime) {
                        lastStop = this.parentStops[stopTimeUpdates[stopTimeUpdates.length - 1].stopId.slice(0, -1)]["stopName"];
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