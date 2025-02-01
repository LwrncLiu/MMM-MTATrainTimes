class MMMMTATrainTimes {
    constructor(config, sendSocketNotification, updateDom) {
        this.config = {
            updateInterval: 20000,   // recalculate train status every 20 seconds
            callApiInterval: 300000, // call API every 10 minutes
            fadeSpeed: 0,
            retryDelay: 2500,
            apiBase: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
            stopName: "",
            futureArrivals: [],
            ...config,
        };
        this.sendSocketNotification = sendSocketNotification;
        this.updateDom = updateDom;
    }

    getHeader() {
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
        return `${this.config.stopName} ${directionMessage} Trains`
    }

    start() {
        this.sendSocketNotification("GET_STOP_NAME", this.config);
        this.sendSocketNotification("GET_TRAIN_STATUS", this.config);

        // Fetch API data every callApiInterval
        this.trainStatusInterval = setInterval(() => {
            this.sendSocketNotification("GET_TRAIN_STATUS", this.config);
        }, this.config.callApiInterval);

        // Refresh the DOM every updateInterval
        this.domUpdateInterval = setInterval(() => {
            this.updateDom(this.config.fadeSpeed);
        }, this.config.updateInterval);
    }

    getDom() {
        const wrapper = document.createElement("div");
        wrapper.classList.add(this.config.classes || "urban", "bright");

        if (!this.config.futureArrivals.length) {
            wrapper.innerHTML = "<div>No upcoming arrivals</div>";
            return wrapper;
        }

        const now = Date.now();
        const arrivalsToDisplay = this.config.futureArrivals
            .sort((a, b) => a.arrivalTime - b.arrivalTime)
            .map((arrival) => this.createArrivalElement(arrival, now))
            .filter(Boolean)
            .slice(0, this.config.numTrains)
            .join("");

        wrapper.innerHTML = `<div class="train-status">${arrivalsToDisplay}</div>`;
        return wrapper;
    }

    createArrivalElement(arrival, now) {
        const arrivalTimeInMinutes = Math.floor((arrival.arrivalTime - now) / 60000); // floor because better early than late
        
        if (arrivalTimeInMinutes < 0) return "";

        const arrivalTrain = arrival.routeId.toLowerCase();
        const arrivalTimeMessage = arrivalTimeInMinutes === 0 ? "Now" : `${arrivalTimeInMinutes} min`;

        return `<div>
            <span class="station-arrival">
                <span class="station"><img class="train-logo" src="MMM-MTATrainTimes/images/${arrivalTrain}_train.png">${arrival.lastStop}</span>
                <span class="arrival-time">${arrivalTimeMessage}</span>
            </span>
        </div>`;
    }

    socketNotificationReceived(notification, payload) {
        switch (notification) {
            case "STOP_NAME":
                this.config.stopName = payload.stopName;
                break;
            case "TRAIN_STATUS":
                this.config.futureArrivals = payload;
                this.updateDom(this.config.fadeSpeed);
                break;
            default:
                console.warn("Unknown notification")
        }
    }

    stop() {
        clearInterval(this.trainStatusInterval);
        clearInterval(this.domUpdateInterval);
    }
}

Module.register("MMM-MTATrainTimes", {
    defaults: {
        stopId: "",
        routeIds: [],
        northBound: true,
        southBound: false,
        numTrains: 5,
    },
    getHeader: function () {
        if (this.mtaTrainTimes) {
            return this.mtaTrainTimes.getHeader();
        }
    },

    getStyles: function() {
        return ["MMM-MTATrainTimes.css"];
    },

    start: function () {
        this.mtaTrainTimes = new MMMMTATrainTimes(
            this.config,
            this.sendSocketNotification.bind(this),
            this.updateDom.bind(this)
        );
        this.mtaTrainTimes.start();
    },

    stop: function () {
        if (this.mtaTrainTimes) {
            this.mtaTrainTimes.stop();
        }
    },
    
    getDom: function () {
        if (this.mtaTrainTimes) {
            return this.mtaTrainTimes.getDom()
        }
    },

    socketNotificationReceived: function (notification, payload) {
        if (this.mtaTrainTimes) {
            this.mtaTrainTimes.socketNotificationReceived(notification, payload);
        }
    },
});

// Export for testing
if (typeof module !== "undefined") {
    module.exports = MMMMTATrainTimes;
}