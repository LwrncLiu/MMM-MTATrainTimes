Module.register("MMM-MTATrainTimes", {
    defaults: {
        updateInterval: 20000,
        callApiInterval: 60000,
        fadeSpeed: 0,
        retryDelay: 2500,
        apiBase: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm"
    },
    futureArrivals: [],
    getHeader: function () {
        return "79th St Manhattan Bound D Train";
    },
    getStyles: function() {
        return ["style.css"];
    },

    // Define start sequence
    start: function () {
        Log.info("Starting module: " + this.name);

        // Schedule update timer
        // Fetch API data every 60 seconds
        this.sendSocketNotification("GET_TRAIN_STATUS", null);
        setInterval(() => {
            this.sendSocketNotification("GET_TRAIN_STATUS", null);
        }, this.config.callApiInterval);

        // Refresh the dom more frequently
        setInterval(() => {
            this.updateDom(this.config.fadeSpeed);
        }, this.config.updateInterval)
    },
    
    // Override dom generator
    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.className = this.config.classes ? this.config.classes : "urban bright";
        
        if (this.futureArrivals.length === 0) {
            wrapper.innerHTML = "<div>No upcoming arrivals for Northbound D Train</div>";
        } else {
            const now = Date.now();
            const arrivalList = this.futureArrivals.sort((a, b) => a.arrivalTime - b.arrivalTime).map(arrival => {    
                const arrivalTimeInMinutes = Math.floor((arrival.arrivalTime - now) / 60000);
                if (arrivalTimeInMinutes >= 0) {
                    let arrivalTimeMessage = arrivalTimeInMinutes + " min"
                    if (arrivalTimeInMinutes == 0) {
                        arrivalTimeMessage = "Now"
                    };
                    return `<div>
                        <span class="station-arrival">
                            <span class="station"><img class="train-logo" src="MMM-MTATrainTimes/images/d_train.png" alt="D Train">${arrival.lastStop}</span>
                            <span class="arrival-time">${arrivalTimeMessage}</span>
                        </span>
                    </div>`;
                };
            }).join('');
            wrapper.innerHTML = `<div class="train-status">${arrivalList}</div>`
        }
        return wrapper;
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "TRAIN_STATUS") {
            this.futureArrivals = payload;
            this.updateDom(this.config.fadeSpeed);
        }
    },
});