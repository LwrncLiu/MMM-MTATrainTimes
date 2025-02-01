const MTATrainTimes = require("../MMM-MTATrainTimes.js");

describe("MTATrainTimes", () => {
    let moduleInstance;

    beforeEach(() => {
        moduleInstance = new MTATrainTimes({stopId: "1", routeIds: ["D", "N", "F"], northBound: true, southBound: false, stopName: "Stop1"})
    });

    test("North only header message", () => {
        expect(moduleInstance.getHeader()).toBe("Stop1 Northbound Trains");
    });
})