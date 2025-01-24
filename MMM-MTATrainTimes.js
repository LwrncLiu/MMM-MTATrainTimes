Module.register("MMM-MTATrainTimes", {
    defaults: {
        updateInterval: 20000,   // recalculate train status every 20 seconds
        callApiInterval: 300000, // call API every 10 minutes
        fadeSpeed: 0,
        retryDelay: 2500,
        apiBase: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
        stopId: "",
        routeIds: [],
        northBound: true,
        southBound: false,
        numTrains: 5,
        stopName: "",
        futureArrivals: []
    },
    getHeader: function () {
        let directionMessage = ""
        if (this.config.northBound && this.config.southBound) {
            directionMessage = "Northbound & Southbound";
        } else if (this.config.northBound) {
            directionMessage = "Northbound";
        } else if (this.config.southBound) {
            directionMessage = "Southbound";
        };

        if (directionMessage.length === 0) {
            return "Update Module Config for Train Direction"
        }
        return this.stopName + " " + directionMessage + " Trains"
    },
    getStyles: function() {
        return ["MMM-MTATrainTimes.css"];
    },

    start: function () {
        Log.info("Starting module: " + this.name);

        this.sendSocketNotification("GET_STOP_NAME", this.config);

        // Fetch API data every 5 minutes
        this.sendSocketNotification("GET_TRAIN_STATUS", this.config);
        setInterval(() => {
            this.sendSocketNotification("GET_TRAIN_STATUS", this.config);
        }, this.config.callApiInterval);

        // Refresh the dom more frequently
        setInterval(() => {
            this.updateDom(this.config.fadeSpeed);
        }, this.config.updateInterval)
    },
    
    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.className = this.config.classes ? this.config.classes : "urban bright";
        
        if (this.config.futureArrivals.length === 0) {
            wrapper.innerHTML = "<div>No upcoming arrivals</div>";
        } else {
            const now = Date.now();
            const arrivalList = this.config.futureArrivals.sort((a, b) => a.arrivalTime - b.arrivalTime).map(arrival => {    
                const arrivalTimeInMinutes = Math.floor((arrival.arrivalTime - now) / 60000);
                const arrivalTrain = arrival.routeId.toLowerCase();
                if (arrivalTimeInMinutes >= 0) {
                    let arrivalTimeMessage = arrivalTimeInMinutes + " min"
                    if (arrivalTimeInMinutes == 0) {
                        arrivalTimeMessage = "Now"
                    };
                    return `<div>
                        <span class="station-arrival">
                            <span class="station"><img class="train-logo" src="MMM-MTATrainTimes/images/${arrivalTrain}_train.png">${arrival.lastStop}</span>
                            <span class="arrival-time">${arrivalTimeMessage}</span>
                        </span>
                    </div>`;
                };
            });
            const arrivalsToDisplay = arrivalList.filter( Boolean ).slice(0, this.config.numTrains).join('');
            wrapper.innerHTML = `<div class="train-status">${arrivalsToDisplay}</div>`
        }
        return wrapper;
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "STOP_NAME") {
            this.stopName = payload.stopName;
        };
        if (notification === "TRAIN_STATUS") {
            this.config.futureArrivals = payload;
            this.updateDom(this.config.fadeSpeed);
        };
    },
});