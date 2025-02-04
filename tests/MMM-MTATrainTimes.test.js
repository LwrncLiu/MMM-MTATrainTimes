const MTATrainTimes = require('../MMM-MTATrainTimes');

jest.useFakeTimers();

describe('MTATrainTimes', () => {

    describe('getHeader', () => {
        let sendSocketNotification;
        let updateDom;
    
        beforeEach(() => {
            sendSocketNotification = jest.fn();
            updateDom = jest.fn()
        });
    
        test('return correct header when both northbound and southbound are true', () => {
            const config = { northBound: true, southBound: true, stopName: '14 St-Union Sq' };
            const trainTimes = new MTATrainTimes(config, sendSocketNotification, updateDom);
            expect(trainTimes.getHeader()).toBe('14 St-Union Sq Northbound & Southbound Trains');
        });

        test('return correct header when only northbound is true', () => {
            const config = { northBound: true, southBound: false, stopName: '14 St-Union Sq' };
            const trainTimes = new MTATrainTimes(config, sendSocketNotification, updateDom);
            expect(trainTimes.getHeader()).toBe('14 St-Union Sq Northbound Trains');
        });

        test('return correct header when only southbound is true', () => {
            const config = { northBound: false, southBound: true, stopName: '14 St-Union Sq' };
            const trainTimes = new MTATrainTimes(config, sendSocketNotification, updateDom);
            expect(trainTimes.getHeader()).toBe('14 St-Union Sq Southbound Trains');
        });

        test('return correct header when no direction is set to true', () => {
            const config = { northBound: false, southBound: false, stopName: '14 St-Union Sq' };
            const trainTimes = new MTATrainTimes(config, sendSocketNotification, updateDom);
            expect(trainTimes.getHeader()).toBe('Update Module Config for Train Direction');
        });

        test('return correct header when no stop name is available', () => {
            const config = { northBound: true, southBound: false };
            const trainTimes = new MTATrainTimes(config, sendSocketNotification, updateDom);
            expect(trainTimes.getHeader()).toBe(' Northbound Trains');
        });
    });

    describe('start', () => {
        let sendSocketNotification;
        let updateDom;
        let trainTimes;
        jest.spyOn(global, 'setInterval');

        beforeEach(() => {
            sendSocketNotification = jest.fn();
            updateDom = jest.fn()
            trainTimes = new MTATrainTimes({}, sendSocketNotification, updateDom);
        });

        afterEach(() => {
            jest.clearAllMocks();
            jest.clearAllTimers();
        });

        test('send initial socket notifications', () => {
            trainTimes.start();

            expect(sendSocketNotification).toHaveBeenCalledTimes(2);
            expect(sendSocketNotification).toHaveBeenCalledWith('GET_STOP_NAME', trainTimes.config);
            expect(sendSocketNotification).toHaveBeenCalledWith('GET_TRAIN_STATUS', trainTimes.config);
        });

        test('interval for fetching train status', () => {
            trainTimes.start();

            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), trainTimes.config.callApiInterval);
            
            jest.advanceTimersByTime(trainTimes.config.callApiInterval);
            expect(sendSocketNotification).toHaveBeenCalledTimes(3);
            expect(sendSocketNotification).toHaveBeenLastCalledWith('GET_TRAIN_STATUS', trainTimes.config);
        });

        test('call for train status at regular intervals', () => {
            trainTimes.start();

            jest.advanceTimersByTime(trainTimes.config.callApiInterval * 5);
            expect(sendSocketNotification).toHaveBeenCalledTimes(7);
            expect(sendSocketNotification).toHaveBeenLastCalledWith('GET_TRAIN_STATUS', trainTimes.config);
        });

        test('interval for updating the DOM', () => {
            trainTimes.start();

            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), trainTimes.config.updateInterval);

            jest.advanceTimersByTime(trainTimes.config.updateInterval);
            expect(updateDom).toHaveBeenCalledTimes(1);
            expect(updateDom).toHaveBeenLastCalledWith(trainTimes.config.fadeSpeed);
        });

        test('update DOM at regular intervals', () => {
            trainTimes.start();

            jest.advanceTimersByTime(trainTimes.config.updateInterval * 5);
            expect(updateDom).toHaveBeenCalledTimes(5);
        });
    });

    describe('stop', () => {
        let sendSocketNotification;
        let updateDom;
        let trainTimes;
        jest.spyOn(global, 'clearInterval');

        beforeEach(() => {
            sendSocketNotification = jest.fn();
            updateDom = jest.fn()
            trainTimes = new MTATrainTimes({}, sendSocketNotification, updateDom);
        });

        afterEach(() => {
            jest.clearAllMocks();
        })

        test('stops intervals', () => {

            trainTimes.start();
            trainTimes.stop();

            expect(clearInterval).toHaveBeenCalledTimes(2);
            expect(clearInterval).toHaveBeenCalledWith(trainTimes.trainStatusInterval);
            expect(clearInterval).toHaveBeenCalledWith(trainTimes.domUpdateInterval);
        });
    });

    describe('socketNotificationReceived', () => {
        let sendSocketNotification;
        let updateDom;
        let trainTimes;

        beforeEach(() => {
            sendSocketNotification = jest.fn();
            updateDom = jest.fn()
            trainTimes = new MTATrainTimes({}, sendSocketNotification, updateDom);
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        test('set stopName from payload', () => {
            let notification = 'STOP_NAME';
            let payload = {'stopName': '14 St-Union Sq'};
            trainTimes.socketNotificationReceived(notification, payload);

            expect(trainTimes.config.stopName).toBe(payload.stopName);
            expect(updateDom).not.toHaveBeenCalled();
        });

        test('update future arrivals', () => {
            let notification = 'TRAIN_STATUS';
            let payload = {'futureTrains': 'futureTrains'};
            trainTimes.socketNotificationReceived(notification, payload);

            expect(trainTimes.config.stopName).toBe('');
            expect(trainTimes.config.futureArrivals).toBe(payload);
            expect(updateDom).toHaveBeenCalledWith(trainTimes.config.fadeSpeed);
        });

        test('unknown notification', () => {
            let notification = 'RANDOM';
            let payload = {};
            jest.spyOn(console, 'warn').mockImplementation(() => {});

            trainTimes.socketNotificationReceived(notification, payload);

            expect(console.warn).toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith('Unknown notification');

            console.warn.mockRestore();
        });
    });

    describe('createArrivalElement', () => {
        let sendSocketNotification;
        let updateDom;
        let trainTimes;

        beforeEach(() => {
            sendSocketNotification = jest.fn();
            updateDom = jest.fn();
            trainTimes = new MTATrainTimes({}, sendSocketNotification, updateDom);
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        test('empty string if arrival time has passed', () => {
            const arrival = { arrivalTime: Date.now() - 10000, routeId: 'D', lastStop: 'Coney Island-Stillwell Avenue' };
            const result = trainTimes.createArrivalElement(arrival, Date.now());
            expect(result).toBe('');
        });

        test('arrival status is now if arrival is within a minute', () => {
            const arrival = {arrivalTime: Date.now() + 10000, routeId: 'D', lastStop: 'Coney Island-Stillwell Avenue' };
            const result = trainTimes.createArrivalElement(arrival, Date.now());
            expect(result).toContain('<span class="arrival-time">Now</span>');
            expect(result).toContain('src="MMM-MTATrainTimes/images/d_train.png"');
            expect(result).toContain('Coney Island-Stillwell Avenue');
        });

        test('arrival status is correctly formatted and floored', () => {
            const arrival = {arrivalTime: Date.now() + (3 * 60000) + 10000, routeId: 'D', lastStop: 'Coney Island-Stillwell Avenue' };
            const result = trainTimes.createArrivalElement(arrival, Date.now());
            expect(result).toContain('<span class="arrival-time">3 min</span>');
            expect(result).toContain('src="MMM-MTATrainTimes/images/d_train.png"');
            expect(result).toContain('Coney Island-Stillwell Avenue');
        });
    });

    describe('getDom', () => {
        let sendSocketNotification;
        let updateDom;
        let trainTimes;
        let mockCreateArrivalElement;
        let mockCreateElement;

        beforeEach(() => {
            mockCreateArrivalElement = jest.spyOn(MTATrainTimes.prototype, "createArrivalElement");
            mockCreateElement = jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
                return { tagName, classList: { add: jest.fn(), contains: jest.fn() }, innerHTML: "" };
            });
            sendSocketNotification = jest.fn();
            updateDom = jest.fn();
            trainTimes = new MTATrainTimes({ futureArrivals: []}, sendSocketNotification, updateDom);
        });

        afterEach(() => {
            mockCreateArrivalElement.mockRestore();
            mockCreateElement.mockRestore();
        });

        test('should return a div element', () => {
            const result = trainTimes.getDom();

            expect(result.tagName).toBe('div');
        });

        test('display no upcoming arrivals when futureArrivals is empty', () => {
            const result = trainTimes.getDom();
            expect(result.innerHTML).toBe('<div>No upcoming arrivals</div>');
        });

        test('call createArrivalElement for each element in futureArrivals', () => {
            trainTimes.config.futureArrivals = [
                { arrivalTime: Date.now() },
                { arrivalTime: Date.now() }
            ];

            mockCreateArrivalElement.mockImplementation((arrival) => `<div>Arrival</div>`);
            const result = trainTimes.getDom();

            expect(mockCreateArrivalElement).toHaveBeenCalledTimes(2);
            expect(result.innerHTML).toContain('<div>Arrival</div><div>Arrival</div>');
        });

        test('sort and return only numTrains amount of arrivals', () => {
            trainTimes.config.futureArrivals = [
                { arrivalTime: Date.now() + 50000, routeId: 'A', lastStop: 'Stop A' },
                { arrivalTime: Date.now() + 30000, routeId: 'B', lastStop: 'Stop B' },
                { arrivalTime: Date.now() + 40000, routeId: 'C', lastStop: 'Stop C' },
                { arrivalTime: Date.now() + 60000, routeId: 'D', lastStop: 'Stop D' },
                { arrivalTime: Date.now() + 10000, routeId: 'E', lastStop: 'Stop E' },
            ];
            trainTimes.config.numTrains = 3;

            mockCreateArrivalElement.mockImplementation((arrival) => `<div>${arrival.routeId}</div>`);
            const result = trainTimes.getDom();

            expect(mockCreateArrivalElement).toHaveBeenCalledTimes(5);
            expect(result.innerHTML).not.toContain('A');
            expect(result.innerHTML).not.toContain('D');
            expect(result.innerHTML).toContain('<div>E</div><div>B</div><div>C</div>');
        })
    });
    
})