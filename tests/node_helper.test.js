const { response } = require('express');
const MTATrainTimesNodeHelper = require('../node_helper');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

describe('MTATrainTimesNodeHelper', () => {

    describe('socketNotificationReceived', () => {
        let nodeHelper;
        let sendSocketNotification;

        beforeEach(() => {
            sendSocketNotification = jest.fn();
            nodeHelper = new MTATrainTimesNodeHelper({}, {}, sendSocketNotification);
        });

        afterEach(() => {
            jest.clearAllMocks();
            jest.restoreAllMocks();
        });

        test('call getTrainStatus and send TRAIN_STATUS for GET_TRAIN_STATUS notification', async () => {
            const notification = 'GET_TRAIN_STATUS';
            const payload = {
                stopId: 'B19',
                northBound: true, 
                southBound: true,
                routeIds: ['A', 'B']
            };
            const mockTrainStatus = [{ arrivalTime: 'time'}];
            jest.spyOn(nodeHelper, 'getTrainStatus').mockResolvedValue(mockTrainStatus);

            await nodeHelper.socketNotificationReceived(notification, payload);

            expect(nodeHelper.getTrainStatus).toHaveBeenCalledWith('B19', true, true, ['A', 'B']);
            expect(sendSocketNotification).toHaveBeenCalledWith('TRAIN_STATUS', mockTrainStatus);
        });

        test('returns correct stop name and sends STOP_NAME for GET_STOP_NAME notification', async () => {
            const notification = 'GET_STOP_NAME';
            const payload = { stopId: 'B19' };
            const stopName = 'My Stop';
            nodeHelper.parentStops = { 'B19': { 'stopName': stopName } };

            await nodeHelper.socketNotificationReceived(notification, payload);

            expect(sendSocketNotification).toHaveBeenCalledWith('STOP_NAME', { stopId: 'B19', stopName });
        });

        test('log a warning for unknown notification', async () => {
            const notification = 'RANDOM';
            jest.spyOn(console, 'warn').mockImplementation();

            nodeHelper.socketNotificationReceived(notification, {});

            expect(console.warn).toHaveBeenCalledWith('Unknown notification RANDOM');
        });


    });

    describe('parseTripDirection', () => {

        let nodeHelper;
        let sendSocketNotification;

        beforeEach(() => {
            sendSocketNotification = jest.fn();
            nodeHelper = new MTATrainTimesNodeHelper({}, {}, sendSocketNotification);
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        test('return "South" for a valid tripID', () => {
            expect(nodeHelper.parseTripDirection('123456_A..S')).toBe('South');
        });

        test('return "North" for a valid tripID', () => {
            expect(nodeHelper.parseTripDirection('123456_A..N')).toBe('North');
        });

        test('return null for invalid or null tripID formats', () => {
            expect(nodeHelper.parseTripDirection('invalid_id')).toBeNull();
            expect(nodeHelper.parseTripDirection('123456_A..A')).toBeNull();
            expect(nodeHelper.parseTripDirection('123456..N')).toBeNull();
            expect(nodeHelper.parseTripDirection('123456_..S')).toBeNull();
            expect(nodeHelper.parseTripDirection('')).toBeNull();
            expect(nodeHelper.parseTripDirection(null)).toBeNull();
            expect(nodeHelper.parseTripDirection(undefined)).toBeNull();
        });
    });

    describe('isArrivingTrain', () => {

        let nodeHelper;
        let apiBases;
        let parentStops;
        let sendSocketNotification;

        beforeEach(() => {
            apiBases = {};
            parentStops = {};
            sendSocketNotification = jest.fn();
            nodeHelper = new MTATrainTimesNodeHelper(apiBases, parentStops, sendSocketNotification);
            jest.spyOn(nodeHelper, 'parseTripDirection');
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        test('return True when northBound and southBound and trip direction is North', () => {
            nodeHelper.parseTripDirection.mockReturnValue('North');
            const tripUpdate = { trip: {tripId: 'tripId' } };
            expect(nodeHelper.isArrivingTrain(tripUpdate, true, true)).toBe(true);
        });

        test('return True when northBound and southBound and trip direction is South', () => {
            nodeHelper.parseTripDirection.mockReturnValue('South');
            const tripUpdate = { trip: {tripId: 'tripId' } };
            expect(nodeHelper.isArrivingTrain(tripUpdate, true, true)).toBe(true);
        });

        test('return True when northBound and trip direction is North', () => {
            nodeHelper.parseTripDirection.mockReturnValue('North');
            const tripUpdate = { trip: {tripId: 'tripId' } };
            expect(nodeHelper.isArrivingTrain(tripUpdate, true, false)).toBe(true);
        });

        test('return False when northBound and trip direction is South', () => {
            nodeHelper.parseTripDirection.mockReturnValue('South');
            const tripUpdate = { trip: {tripId: 'tripId' } };
            expect(nodeHelper.isArrivingTrain(tripUpdate, true, false)).toBe(false);
        });

        test('return True when southBound and trip direction is South', () => {
            nodeHelper.parseTripDirection.mockReturnValue('South');
            const tripUpdate = { trip: {tripId: 'tripId' } };
            expect(nodeHelper.isArrivingTrain(tripUpdate, false, true)).toBe(true);
        });

        test('return False when southBound and trip direction is North', () => {
            nodeHelper.parseTripDirection.mockReturnValue('North');
            const tripUpdate = { trip: {tripId: 'tripId' } };
            expect(nodeHelper.isArrivingTrain(tripUpdate, false, true)).toBe(false);
        });

        test('return False when not northBound or Southbound', () => {
            nodeHelper.parseTripDirection.mockReturnValue('North');
            const tripUpdate = { trip: {tripId: 'tripId' } };
            expect(nodeHelper.isArrivingTrain(tripUpdate, false, false)).toBe(false);
        });

        test('return False when tripID is null', () => {
            nodeHelper.parseTripDirection.mockReturnValue('North');
            const tripUpdate = null;
            expect(nodeHelper.isArrivingTrain(tripUpdate, true, true)).toBe(false);
        });
    });

    describe('getApis', () => {
        let nodeHelper;
        let apiBases;
        let parentStops;
        let sendSocketNotification;

        beforeEach(() => {
            apiBases = {
                'A': 'https://api-endpoint.mta.info/A',
                'B': 'https://api-endpoint.mta.info/B',
                'C': 'https://api-endpoint.mta.info/CD',
                'D': 'https://api-endpoint.mta.info/CD',
            };
            parentStops = {};
            sendSocketNotification = jest.fn();
            nodeHelper = new MTATrainTimesNodeHelper(apiBases, parentStops, sendSocketNotification);
            jest.spyOn(console, 'warn').mockImplementation(() => {});
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        test('return all distinct apiBases when routeIds is empty', () => {
            expect(nodeHelper.getApis([])).toEqual([
                'https://api-endpoint.mta.info/A',
                'https://api-endpoint.mta.info/B',
                'https://api-endpoint.mta.info/CD'])
        });

        test('return matching distinct apiBases for provided routeIds', () => {
            expect(nodeHelper.getApis(['B', 'D'])).toEqual([
                'https://api-endpoint.mta.info/B',
                'https://api-endpoint.mta.info/CD'])
        });

        test('return an empty list with a warning for invalid routeIds', () => {
            let response = nodeHelper.getApis(['E']);
            expect(response).toEqual([]);
            expect(console.warn).toHaveBeenCalledWith('Invalid routeIds E');
        });
    });

    describe('callApis', () => {
        let nodeHelper;
        let apiBases;
        let parentStops;
        let sendSocketNotification;

        beforeEach(() => {
            apiBases = {};
            parentStops = {};
            sendSocketNotification = jest.fn();
            nodeHelper = new MTATrainTimesNodeHelper(apiBases, parentStops, sendSocketNotification);
            global.fetch = jest.fn();
        });

        afterEach(() => {
            jest.clearAllMocks();
            jest.restoreAllMocks();
        });

        test('return an array or responses when API calls are successful', async () => {
            const apiBases = ['https://api-endpoint.mta.info/A','https://api-endpoint.mta.info/B'];
            fetch.mockResolvedValueOnce({
                ok: true, url: 'https://api-endpoint.mta.info/A', status: 200, statusText: 'OK'
            }).mockResolvedValueOnce({
                ok: true, url: 'https://api-endpoint.mta.info/B', status: 200, statusText: 'OK'
            })

            const responses = await nodeHelper.callApis(apiBases);
            expect(responses).toHaveLength(2);
            expect(responses[0].url).toBe('https://api-endpoint.mta.info/A');
            expect(responses[1].url).toBe('https://api-endpoint.mta.info/B');
        });

        test('return an empty array when apiBases are empty', async () => {
            const apiBases = [];
            const responses = await nodeHelper.callApis(apiBases);
            expect(responses).toEqual([]);
        });

        test('log an error and return nothing when API call fails', async () => {
            const apiBases = ['https://api-endpoint.mta.info/A','https://api-endpoint.mta.info/B'];
            fetch.mockResolvedValueOnce({
                ok: true, url: 'https://api-endpoint.mta.info/A', status: 200, statusText: 'OK'
            }).mockResolvedValueOnce({
                ok: false, url: 'https://api-endpoint.mta.info/B', status: 404, statusText: 'Page Not Found'
            });
            jest.spyOn(console, 'error').mockImplementation(() => {});
            const responses = await nodeHelper.callApis(apiBases);

            expect(console.error).toHaveBeenCalledWith('Error calling APIs: Error: https://api-endpoint.mta.info/B: 404 Page Not Found')
            expect(responses).toBeUndefined();
        });
    });

    describe('parsefutureArrivals', () => {
        let nodeHelper;
        let mockIsArrivingTrain;
    
        beforeEach(() => {
            mockIsArrivingTrain = jest.fn();
            nodeHelper = new MTATrainTimesNodeHelper({}, {}, jest.fn());
            nodeHelper.isArrivingTrain = mockIsArrivingTrain;
            nodeHelper.parentStops = {
                'B19': {'childStops': ['B19N', 'B19S'], 'stopName': '18 Av'},
                'D11': {'childStops': ['D11N', 'D11S'], 'stopName': '161 St-Yankee Stadium'},
            };
        });
    
        afterEach(() => {
            jest.clearAllMocks();
        });
    
        test('should return parsed future arrivals when API response is valid', async () => {
            const stopId = 'B19';
            const northBound = true;
            const southBound = true;
            const routeIds = ['D'];
    
            // Mock GTFS response
            const mockResponse = {
                arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
            };
    
            // Mock decoded GTFS message
            const mockFeedMessage = {
                entity: [
                    {
                        tripUpdate: {
                            trip: { routeId: 'D' },
                            stopTimeUpdate: [
                                { stopId: 'B19N', arrival: { time: { low: 1700000000 } } },
                                { stopId: 'D11N', arrival: { time: { low: 1700005000 } } }
                            ]
                        }
                    }
                ]
            };
    
            // Mocking GTFS decoding
            jest.spyOn(GtfsRealtimeBindings.transit_realtime.FeedMessage, 'decode').mockReturnValue(mockFeedMessage);
            mockIsArrivingTrain.mockReturnValue(true);
    
            const responses = [mockResponse];
            const result = await nodeHelper.parsefutureArrivals(stopId, northBound, southBound, routeIds, responses);
    
            expect(result).toEqual([
                {
                    arrivalTime: 1700000000 * 1000, // Convert seconds to milliseconds
                    lastStop: '161 St-Yankee Stadium',
                    routeId: 'D'
                }
            ]);
    
            expect(mockIsArrivingTrain).toHaveBeenCalledWith(expect.any(Object), northBound, southBound);
            expect(GtfsRealtimeBindings.transit_realtime.FeedMessage.decode).toHaveBeenCalledWith(expect.any(Uint8Array));
        });
    
        test('should return an empty array when there are no valid arrivals', async () => {
            const stopId = 'B19';
            const northBound = true;
            const southBound = true;
            const routeIds = ['D'];
    
            const mockResponse = {
                arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
            };
    
            const mockFeedMessage = { entity: [] }; // No trip updates
    
            jest.spyOn(GtfsRealtimeBindings.transit_realtime.FeedMessage, 'decode').mockReturnValue(mockFeedMessage);
    
            const responses = [mockResponse];
            const result = await nodeHelper.parsefutureArrivals(stopId, northBound, southBound, routeIds, responses);
    
            expect(result).toEqual([]);
        });
    
        test('should return an empty array when isArrivingTrain returns false', async () => {
            const stopId = 'B19';
            const northBound = true;
            const southBound = true;
            const routeIds = ['D', 'B'];
    
            const mockResponse = {
                arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
            };
    
            const mockFeedMessage = {
                entity: [
                    {
                        tripUpdate: {
                            trip: { routeId: 'D' },
                            stopTimeUpdate: [
                                { stopId: 'B19N', arrival: { time: { low: 1700000000 } } }
                            ]
                        }
                    }
                ]
            };
    
            jest.spyOn(GtfsRealtimeBindings.transit_realtime.FeedMessage, 'decode').mockReturnValue(mockFeedMessage);
            mockIsArrivingTrain.mockReturnValue(false);
    
            const responses = [mockResponse];
            const result = await nodeHelper.parsefutureArrivals(stopId, northBound, southBound, routeIds, responses);
    
            expect(result).toEqual([]); // No valid arrivals because isArrivingTrain returned false
        });
    
        test('should log an error and return undefined when an exception occurs', async () => {
            console.error = jest.fn(); // Mock console.error
    
            const stopId = 'B19';
            const northBound = true;
            const southBound = true;
            const routeIds = ['D', 'B'];
    
            const mockResponse = {
                arrayBuffer: jest.fn().mockRejectedValue(new Error('Failed to fetch')),
            };
    
            const responses = [mockResponse];
            const result = await nodeHelper.parsefutureArrivals(stopId, northBound, southBound, routeIds, responses);
    
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error processing API responses: Error: Failed to fetch'));
            expect(result).toBeUndefined();
        });
    });
});