const MTATrainTimes = require("../MMM-MTATrainTimes");

describe("MTATrainTimes", () => {
    let moduleInstance;

    beforeEach(() => {
        moduleInstance = new MTATrainTimes({
            stopId: "1", 
            routeIds: ["D", "N", "F"], 
            northBound: true, 
            southBound: false, 
            numTrains: 5})
    });

    test("North only header message", () => {
        expect(moduleInstance.getHeader()).toBe(" Northbound Trains");
    });
})