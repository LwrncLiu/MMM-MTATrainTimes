const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const { response } = require('express');

class MTATrainTimesNodeHelper {
    constructor(apiBases, parentStops, sendSocketNotification) {
        this.apiBases = apiBases;
        this.parentStops = parentStops;
        this.sendSocketNotification = sendSocketNotification;
    }

    socketNotificationReceived(notification, payload) {
        console.log(notification)
        switch (notification) {
            case 'GET_TRAIN_STATUS': {
                const stopId = payload.stopId;
                const northBound = payload.northBound;
                const southBound = payload.southBound;
                const routeIds = payload.routeIds;
                this.getTrainStatus(stopId, northBound, southBound, routeIds)
                    .then((futureArrivals) => {
                        this.sendSocketNotification('TRAIN_STATUS', futureArrivals);
                    })
                    .catch((error) => {
                        console.error('Error fetching train status:', error);
                    });
                break;
            }
            case 'GET_STOP_NAME': {
                const stopId = payload.stopId;
                const stopName = this.parentStops[stopId]['stopName'];
                this.sendSocketNotification('STOP_NAME', {stopId: stopId, stopName: stopName});
                break;
            }
            default:
                console.warn(`Unknown notification ${notification}`);
        }
    }

    async getTrainStatus(stopId, northBound, southBound, routeIds) {
        try {
            const fetch = (await import('node-fetch')).default;

            const apiBases = this.getApis(routeIds);
            const responses = await this.callApis(apiBases);
            const futureArrivals = await this.parsefutureArrivals(stopId, northBound, southBound, routeIds, responses);
            return futureArrivals;
        }
        catch (error) {
            console.error(error);
            process.exit(1);
        }
    }

    getApis(routeIds) {
        let apiBases = NaN
        if (routeIds.length > 0) {
            apiBases = routeIds
                .filter(routeId => routeId in this.apiBases)
                .map(routeId => this.apiBases[routeId]);
            if (apiBases.length === 0) {
                console.warn(`Invalid routeIds ${routeIds}`)
            }
        } else {
            apiBases = Object.values(this.apiBases)
        }

        return [...new Set(apiBases)];
    }

    async callApis(apiBases) {
        try {
            const responses = await Promise.all(
                apiBases.map(async (apiBase) => {
                    const response = await fetch(apiBase);
                    if (!response.ok) {
                        throw new Error(`${response.url}: ${response.status} ${response.statusText}`);
                    }
                    return response;
                })
            );
            return responses;
        } catch (error) {
            console.error(`Error calling APIs: ${error}`);
        }
    }

    async parsefutureArrivals(stopId, northBound, southBound, routeIds, responses) {
        try {
            const allFutureArrivals = await Promise.all(responses.map(async (response) => {
                const futureArrivals = [];
                const buffer = await response.arrayBuffer();
                const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

                feed.entity.forEach((entity) => {
                    if (entity.tripUpdate && this.isArrivingTrain(entity.tripUpdate, northBound, southBound)) {
                        const stopTimeUpdates = entity.tripUpdate.stopTimeUpdate;
                        const routeId = entity.tripUpdate.trip.routeId;
                        if (routeIds.length === 0 || routeIds.includes(routeId)) {
                            let stopArrivalTime = null;
                            let lastStop = null;
    
                            for (let update of stopTimeUpdates) {
                                if (this.parentStops[stopId]['childStops'].includes(update.stopId)) {
                                    stopArrivalTime = update.arrival.time;
                                };
                            };
                            if (stopArrivalTime) {
                                lastStop = this.parentStops[stopTimeUpdates[stopTimeUpdates.length - 1].stopId.slice(0, -1)]?.stopName || 'unknown'; 
                            };
                            if (lastStop) {
                                futureArrivals.push({
                                    'arrivalTime': stopArrivalTime.low * 1000,
                                    'lastStop': lastStop,
                                    'routeId': routeId
                                });
                            };
                        };
                    };
                });
                return futureArrivals;
            }));

            return allFutureArrivals.flat();
        } catch (error) {
            console.error(`Error processing API responses: ${error}`)
        }
    }

    parseTripDirection(tripId) {
        if (tripId) {
            const pattern = /^\d{6}_[A-Za-z0-9]\.\.(S|N)/;
            const match = tripId.match(pattern);
            if (match) {
                const direction = match[1];
                return direction === 'S' ? 'South' : 'North';
            };
        }
        return null;
    }

    isArrivingTrain(tripUpdate, northBound, southBound) {
        let isArrivingTrain = false;    
        
        if (tripUpdate) {
            const isNorthbound = this.parseTripDirection(tripUpdate.trip.tripId) === 'North';
            if (isNorthbound !== null) {
                if (northBound && southBound) {
                    isArrivingTrain = true;
                } else if (northBound && !southBound) {
                    isArrivingTrain = (isNorthbound);
                } else if (!northBound && southBound) {
                    isArrivingTrain = (!isNorthbound);
                };   
            };
        };
        return isArrivingTrain;
    }

}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MTATrainTimesNodeHelper;
} else {
    const NodeHelper = require('node_helper');
    module.exports = NodeHelper.create({
        start: function () {
            console.log('Starting node helper for' + this.name);
            this.apiBases = {
                'B': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
                'D': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
                'F': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
                'M': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
                'J': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
                'Z': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
                'L': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l',
                'A': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
                'C': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
                'E': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
                'G': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
                'N': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
                'Q': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
                'R': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
                'W': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
                '1': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
                '2': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
                '3': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
                '4': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
                '5': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
                '6': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
                '7': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
                'S': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
            };
            this.parentStops = {
                '101': {'childStops': ['101N', '101S'], 'stopName': 'Van Cortlandt Park-242 St'},
                '103': {'childStops': ['103N', '103S'], 'stopName': '238 St'},
                '104': {'childStops': ['104N', '104S'], 'stopName': '231 St'},
                '106': {'childStops': ['106N', '106S'], 'stopName': 'Marble Hill-225 St'},
                '107': {'childStops': ['107N', '107S'], 'stopName': '215 St'},
                '108': {'childStops': ['108N', '108S'], 'stopName': '207 St'},
                '109': {'childStops': ['109N', '109S'], 'stopName': 'Dyckman St'},
                '110': {'childStops': ['110N', '110S'], 'stopName': '191 St'},
                '111': {'childStops': ['111N', '111S'], 'stopName': '181 St'},
                '112': {'childStops': ['112N', '112S'], 'stopName': '168 St-Washington Hts'},
                '113': {'childStops': ['113N', '113S'], 'stopName': '157 St'},
                '114': {'childStops': ['114N', '114S'], 'stopName': '145 St'},
                '115': {'childStops': ['115N', '115S'], 'stopName': '137 St-City College'},
                '116': {'childStops': ['116N', '116S'], 'stopName': '125 St'},
                '117': {'childStops': ['117N', '117S'], 'stopName': '116 St-Columbia University'},
                '118': {'childStops': ['118N', '118S'], 'stopName': 'Cathedral Pkwy (110 St)'},
                '119': {'childStops': ['119N', '119S'], 'stopName': '103 St'},
                '120': {'childStops': ['120N', '120S'], 'stopName': '96 St'},
                '121': {'childStops': ['121N', '121S'], 'stopName': '86 St'},
                '122': {'childStops': ['122N', '122S'], 'stopName': '79 St'},
                '123': {'childStops': ['123N', '123S'], 'stopName': '72 St'},
                '124': {'childStops': ['124N', '124S'], 'stopName': '66 St-Lincoln Center'},
                '125': {'childStops': ['125N', '125S'], 'stopName': '59 St-Columbus Circle'},
                '126': {'childStops': ['126N', '126S'], 'stopName': '50 St'},
                '127': {'childStops': ['127N', '127S'], 'stopName': 'Times Sq-42 St'},
                '128': {'childStops': ['128N', '128S'], 'stopName': '34 St-Penn Station'},
                '129': {'childStops': ['129N', '129S'], 'stopName': '28 St'},
                '130': {'childStops': ['130N', '130S'], 'stopName': '23 St'},
                '131': {'childStops': ['131N', '131S'], 'stopName': '18 St'},
                '132': {'childStops': ['132N', '132S'], 'stopName': '14 St'},
                '133': {'childStops': ['133N', '133S'], 'stopName': 'Christopher St-Sheridan Sq'},
                '134': {'childStops': ['134N', '134S'], 'stopName': 'Houston St'},
                '135': {'childStops': ['135N', '135S'], 'stopName': 'Canal St'},
                '136': {'childStops': ['136N', '136S'], 'stopName': 'Franklin St'},
                '137': {'childStops': ['137N', '137S'], 'stopName': 'Chambers St'},
                '138': {'childStops': ['138N', '138S'], 'stopName': 'WTC Cortlandt'},
                '139': {'childStops': ['139N', '139S'], 'stopName': 'Rector St'},
                '140': {'childStops': ['140N', '140S'], 'stopName': 'South Ferry Loop'},
                '142': {'childStops': ['142N', '142S'], 'stopName': 'South Ferry'},
                '201': {'childStops': ['201N', '201S'], 'stopName': 'Wakefield-241 St'},
                '204': {'childStops': ['204N', '204S'], 'stopName': 'Nereid Av'},
                '205': {'childStops': ['205N', '205S'], 'stopName': '233 St'},
                '206': {'childStops': ['206N', '206S'], 'stopName': '225 St'},
                '207': {'childStops': ['207N', '207S'], 'stopName': '219 St'},
                '208': {'childStops': ['208N', '208S'], 'stopName': 'Gun Hill Rd'},
                '209': {'childStops': ['209N', '209S'], 'stopName': 'Burke Av'},
                '210': {'childStops': ['210N', '210S'], 'stopName': 'Allerton Av'},
                '211': {'childStops': ['211N', '211S'], 'stopName': 'Pelham Pkwy'},
                '212': {'childStops': ['212N', '212S'], 'stopName': 'Bronx Park East'},
                '213': {'childStops': ['213N', '213S'], 'stopName': 'E 180 St'},
                '214': {'childStops': ['214N', '214S'], 'stopName': 'West Farms Sq-E Tremont Av'},
                '215': {'childStops': ['215N', '215S'], 'stopName': '174 St'},
                '216': {'childStops': ['216N', '216S'], 'stopName': 'Freeman St'},
                '217': {'childStops': ['217N', '217S'], 'stopName': 'Simpson St'},
                '218': {'childStops': ['218N', '218S'], 'stopName': 'Intervale Av'},
                '219': {'childStops': ['219N', '219S'], 'stopName': 'Prospect Av'},
                '220': {'childStops': ['220N', '220S'], 'stopName': 'Jackson Av'},
                '221': {'childStops': ['221N', '221S'], 'stopName': '3 Av-149 St'},
                '222': {'childStops': ['222N', '222S'], 'stopName': '149 St-Grand Concourse'},
                '224': {'childStops': ['224N', '224S'], 'stopName': '135 St'},
                '225': {'childStops': ['225N', '225S'], 'stopName': '125 St'},
                '226': {'childStops': ['226N', '226S'], 'stopName': '116 St'},
                '227': {'childStops': ['227N', '227S'], 'stopName': 'Central Park North (110 St)'},
                '228': {'childStops': ['228N', '228S'], 'stopName': 'Park Place'},
                '229': {'childStops': ['229N', '229S'], 'stopName': 'Fulton St'},
                '230': {'childStops': ['230N', '230S'], 'stopName': 'Wall St'},
                '231': {'childStops': ['231N', '231S'], 'stopName': 'Clark St'},
                '232': {'childStops': ['232N', '232S'], 'stopName': 'Borough Hall'},
                '233': {'childStops': ['233N', '233S'], 'stopName': 'Hoyt St'},
                '234': {'childStops': ['234N', '234S'], 'stopName': 'Nevins St'},
                '235': {'childStops': ['235N', '235S'], 'stopName': 'Atlantic Av-Barclays Ctr'},
                '236': {'childStops': ['236N', '236S'], 'stopName': 'Bergen St'},
                '237': {'childStops': ['237N', '237S'], 'stopName': 'Grand Army Plaza'},
                '238': {'childStops': ['238N', '238S'], 'stopName': 'Eastern Pkwy-Brooklyn Museum'},
                '239': {'childStops': ['239N', '239S'], 'stopName': 'Franklin Av-Medgar Evers College'},
                '241': {'childStops': ['241N', '241S'], 'stopName': 'President St-Medgar Evers College'},
                '242': {'childStops': ['242N', '242S'], 'stopName': 'Sterling St'},
                '243': {'childStops': ['243N', '243S'], 'stopName': 'Winthrop St'},
                '244': {'childStops': ['244N', '244S'], 'stopName': 'Church Av'},
                '245': {'childStops': ['245N', '245S'], 'stopName': 'Beverly Rd'},
                '246': {'childStops': ['246N', '246S'], 'stopName': 'Newkirk Av-Little Haiti'},
                '247': {'childStops': ['247N', '247S'], 'stopName': 'Flatbush Av-Brooklyn College'},
                '248': {'childStops': ['248N', '248S'], 'stopName': 'Nostrand Av'},
                '249': {'childStops': ['249N', '249S'], 'stopName': 'Kingston Av'},
                '250': {'childStops': ['250N', '250S'], 'stopName': 'Crown Hts-Utica Av'},
                '251': {'childStops': ['251N', '251S'], 'stopName': 'Sutter Av-Rutland Rd'},
                '252': {'childStops': ['252N', '252S'], 'stopName': 'Saratoga Av'},
                '253': {'childStops': ['253N', '253S'], 'stopName': 'Rockaway Av'},
                '254': {'childStops': ['254N', '254S'], 'stopName': 'Junius St'},
                '255': {'childStops': ['255N', '255S'], 'stopName': 'Pennsylvania Av'},
                '256': {'childStops': ['256N', '256S'], 'stopName': 'Van Siclen Av'},
                '257': {'childStops': ['257N', '257S'], 'stopName': 'New Lots Av'},
                '301': {'childStops': ['301N', '301S'], 'stopName': 'Harlem-148 St'},
                '302': {'childStops': ['302N', '302S'], 'stopName': '145 St'},
                '401': {'childStops': ['401N', '401S'], 'stopName': 'Woodlawn'},
                '402': {'childStops': ['402N', '402S'], 'stopName': 'Mosholu Pkwy'},
                '405': {'childStops': ['405N', '405S'], 'stopName': 'Bedford Park Blvd-Lehman College'},
                '406': {'childStops': ['406N', '406S'], 'stopName': 'Kingsbridge Rd'},
                '407': {'childStops': ['407N', '407S'], 'stopName': 'Fordham Rd'},
                '408': {'childStops': ['408N', '408S'], 'stopName': '183 St'},
                '409': {'childStops': ['409N', '409S'], 'stopName': 'Burnside Av'},
                '410': {'childStops': ['410N', '410S'], 'stopName': '176 St'},
                '411': {'childStops': ['411N', '411S'], 'stopName': 'Mt Eden Av'},
                '412': {'childStops': ['412N', '412S'], 'stopName': '170 St'},
                '413': {'childStops': ['413N', '413S'], 'stopName': '167 St'},
                '414': {'childStops': ['414N', '414S'], 'stopName': '161 St-Yankee Stadium'},
                '415': {'childStops': ['415N', '415S'], 'stopName': '149 St-Grand Concourse'},
                '416': {'childStops': ['416N', '416S'], 'stopName': '138 St-Grand Concourse'},
                '418': {'childStops': ['418N', '418S'], 'stopName': 'Fulton St'},
                '419': {'childStops': ['419N', '419S'], 'stopName': 'Wall St'},
                '420': {'childStops': ['420N', '420S'], 'stopName': 'Bowling Green'},
                '423': {'childStops': ['423N', '423S'], 'stopName': 'Borough Hall'},
                '501': {'childStops': ['501N', '501S'], 'stopName': 'Eastchester-Dyre Av'},
                '502': {'childStops': ['502N', '502S'], 'stopName': 'Baychester Av'},
                '503': {'childStops': ['503N', '503S'], 'stopName': 'Gun Hill Rd'},
                '504': {'childStops': ['504N', '504S'], 'stopName': 'Pelham Pkwy'},
                '505': {'childStops': ['505N', '505S'], 'stopName': 'Morris Park'},
                '601': {'childStops': ['601N', '601S'], 'stopName': 'Pelham Bay Park'},
                '602': {'childStops': ['602N', '602S'], 'stopName': 'Buhre Av'},
                '603': {'childStops': ['603N', '603S'], 'stopName': 'Middletown Rd'},
                '604': {'childStops': ['604N', '604S'], 'stopName': 'Westchester Sq-E Tremont Av'},
                '606': {'childStops': ['606N', '606S'], 'stopName': 'Zerega Av'},
                '607': {'childStops': ['607N', '607S'], 'stopName': 'Castle Hill Av'},
                '608': {'childStops': ['608N', '608S'], 'stopName': 'Parkchester'},
                '609': {'childStops': ['609N', '609S'], 'stopName': 'St Lawrence Av'},
                '610': {'childStops': ['610N', '610S'], 'stopName': 'Morrison Av-Soundview'},
                '611': {'childStops': ['611N', '611S'], 'stopName': 'Elder Av'},
                '612': {'childStops': ['612N', '612S'], 'stopName': 'Whitlock Av'},
                '613': {'childStops': ['613N', '613S'], 'stopName': 'Hunts Point Av'},
                '614': {'childStops': ['614N', '614S'], 'stopName': 'Longwood Av'},
                '615': {'childStops': ['615N', '615S'], 'stopName': 'E 149 St'},
                '616': {'childStops': ['616N', '616S'], 'stopName': "E 143 St-St Mary's St"},
                '617': {'childStops': ['617N', '617S'], 'stopName': 'Cypress Av'},
                '618': {'childStops': ['618N', '618S'], 'stopName': 'Brook Av'},
                '619': {'childStops': ['619N', '619S'], 'stopName': '3 Av-138 St'},
                '621': {'childStops': ['621N', '621S'], 'stopName': '125 St'},
                '622': {'childStops': ['622N', '622S'], 'stopName': '116 St'},
                '623': {'childStops': ['623N', '623S'], 'stopName': '110 St'},
                '624': {'childStops': ['624N', '624S'], 'stopName': '103 St'},
                '625': {'childStops': ['625N', '625S'], 'stopName': '96 St'},
                '626': {'childStops': ['626N', '626S'], 'stopName': '86 St'},
                '627': {'childStops': ['627N', '627S'], 'stopName': '77 St'},
                '628': {'childStops': ['628N', '628S'], 'stopName': '68 St-Hunter College'},
                '629': {'childStops': ['629N', '629S'], 'stopName': '59 St'},
                '630': {'childStops': ['630N', '630S'], 'stopName': '51 St'},
                '631': {'childStops': ['631N', '631S'], 'stopName': 'Grand Central-42 St'},
                '632': {'childStops': ['632N', '632S'], 'stopName': '33 St'},
                '633': {'childStops': ['633N', '633S'], 'stopName': '28 St'},
                '634': {'childStops': ['634N', '634S'], 'stopName': '23 St'},
                '635': {'childStops': ['635N', '635S'], 'stopName': '14 St-Union Sq'},
                '636': {'childStops': ['636N', '636S'], 'stopName': 'Astor Pl'},
                '637': {'childStops': ['637N', '637S'], 'stopName': 'Bleecker St'},
                '638': {'childStops': ['638N', '638S'], 'stopName': 'Spring St'},
                '639': {'childStops': ['639N', '639S'], 'stopName': 'Canal St'},
                '640': {'childStops': ['640N', '640S'], 'stopName': 'Brooklyn Bridge-City Hall'},
                '701': {'childStops': ['701N', '701S'], 'stopName': 'Flushing-Main St'},
                '702': {'childStops': ['702N', '702S'], 'stopName': 'Mets-Willets Point'},
                '705': {'childStops': ['705N', '705S'], 'stopName': '111 St'},
                '706': {'childStops': ['706N', '706S'], 'stopName': '103 St-Corona Plaza'},
                '707': {'childStops': ['707N', '707S'], 'stopName': 'Junction Blvd'},
                '708': {'childStops': ['708N', '708S'], 'stopName': '90 St-Elmhurst Av'},
                '709': {'childStops': ['709N', '709S'], 'stopName': '82 St-Jackson Hts'},
                '710': {'childStops': ['710N', '710S'], 'stopName': '74 St-Broadway'},
                '711': {'childStops': ['711N', '711S'], 'stopName': '69 St'},
                '712': {'childStops': ['712N', '712S'], 'stopName': '61 St-Woodside'},
                '713': {'childStops': ['713N', '713S'], 'stopName': '52 St'},
                '714': {'childStops': ['714N', '714S'], 'stopName': '46 St-Bliss St'},
                '715': {'childStops': ['715N', '715S'], 'stopName': '40 St-Lowery St'},
                '716': {'childStops': ['716N', '716S'], 'stopName': '33 St-Rawson St'},
                '718': {'childStops': ['718N', '718S'], 'stopName': 'Queensboro Plaza'},
                '719': {'childStops': ['719N', '719S'], 'stopName': 'Court Sq'},
                '720': {'childStops': ['720N', '720S'], 'stopName': 'Hunters Point Av'},
                '721': {'childStops': ['721N', '721S'], 'stopName': 'Vernon Blvd-Jackson Av'},
                '723': {'childStops': ['723N', '723S'], 'stopName': 'Grand Central-42 St'},
                '724': {'childStops': ['724N', '724S'], 'stopName': '5 Av'},
                '725': {'childStops': ['725N', '725S'], 'stopName': 'Times Sq-42 St'},
                '726': {'childStops': ['726N', '726S'], 'stopName': '34 St-Hudson Yards'},
                '901': {'childStops': ['901N', '901S'], 'stopName': 'Grand Central-42 St'},
                '902': {'childStops': ['902N', '902S'], 'stopName': 'Times Sq-42 St'},
                'A02': {'childStops': ['A02N', 'A02S'], 'stopName': 'Inwood-207 St'},
                'A03': {'childStops': ['A03N', 'A03S'], 'stopName': 'Dyckman St'},
                'A05': {'childStops': ['A05N', 'A05S'], 'stopName': '190 St'},
                'A06': {'childStops': ['A06N', 'A06S'], 'stopName': '181 St'},
                'A07': {'childStops': ['A07N', 'A07S'], 'stopName': '175 St'},
                'A09': {'childStops': ['A09N', 'A09S'], 'stopName': '168 St'},
                'A10': {'childStops': ['A10N', 'A10S'], 'stopName': '163 St-Amsterdam Av'},
                'A11': {'childStops': ['A11N', 'A11S'], 'stopName': '155 St'},
                'A12': {'childStops': ['A12N', 'A12S'], 'stopName': '145 St'},
                'A14': {'childStops': ['A14N', 'A14S'], 'stopName': '135 St'},
                'A15': {'childStops': ['A15N', 'A15S'], 'stopName': '125 St'},
                'A16': {'childStops': ['A16N', 'A16S'], 'stopName': '116 St'},
                'A17': {'childStops': ['A17N', 'A17S'], 'stopName': 'Cathedral Pkwy (110 St)'},
                'A18': {'childStops': ['A18N', 'A18S'], 'stopName': '103 St'},
                'A19': {'childStops': ['A19N', 'A19S'], 'stopName': '96 St'},
                'A20': {'childStops': ['A20N', 'A20S'], 'stopName': '86 St'},
                'A21': {'childStops': ['A21N', 'A21S'], 'stopName': '81 St-Museum of Natural History'},
                'A22': {'childStops': ['A22N', 'A22S'], 'stopName': '72 St'},
                'A24': {'childStops': ['A24N', 'A24S'], 'stopName': '59 St-Columbus Circle'},
                'A25': {'childStops': ['A25N', 'A25S'], 'stopName': '50 St'},
                'A27': {'childStops': ['A27N', 'A27S'], 'stopName': '42 St-Port Authority Bus Terminal'},
                'A28': {'childStops': ['A28N', 'A28S'], 'stopName': '34 St-Penn Station'},
                'A30': {'childStops': ['A30N', 'A30S'], 'stopName': '23 St'},
                'A31': {'childStops': ['A31N', 'A31S'], 'stopName': '14 St'},
                'A32': {'childStops': ['A32N', 'A32S'], 'stopName': 'W 4 St-Wash Sq'},
                'A33': {'childStops': ['A33N', 'A33S'], 'stopName': 'Spring St'},
                'A34': {'childStops': ['A34N', 'A34S'], 'stopName': 'Canal St'},
                'A36': {'childStops': ['A36N', 'A36S'], 'stopName': 'Chambers St'},
                'A38': {'childStops': ['A38N', 'A38S'], 'stopName': 'Fulton St'},
                'A40': {'childStops': ['A40N', 'A40S'], 'stopName': 'High St'},
                'A41': {'childStops': ['A41N', 'A41S'], 'stopName': 'Jay St-MetroTech'},
                'A42': {'childStops': ['A42N', 'A42S'], 'stopName': 'Hoyt-Schermerhorn Sts'},
                'A43': {'childStops': ['A43N', 'A43S'], 'stopName': 'Lafayette Av'},
                'A44': {'childStops': ['A44N', 'A44S'], 'stopName': 'Clinton-Washington Avs'},
                'A45': {'childStops': ['A45N', 'A45S'], 'stopName': 'Franklin Av'},
                'A46': {'childStops': ['A46N', 'A46S'], 'stopName': 'Nostrand Av'},
                'A47': {'childStops': ['A47N', 'A47S'], 'stopName': 'Kingston-Throop Avs'},
                'A48': {'childStops': ['A48N', 'A48S'], 'stopName': 'Utica Av'},
                'A49': {'childStops': ['A49N', 'A49S'], 'stopName': 'Ralph Av'},
                'A50': {'childStops': ['A50N', 'A50S'], 'stopName': 'Rockaway Av'},
                'A51': {'childStops': ['A51N', 'A51S'], 'stopName': 'Broadway Junction'},
                'A52': {'childStops': ['A52N', 'A52S'], 'stopName': 'Liberty Av'},
                'A53': {'childStops': ['A53N', 'A53S'], 'stopName': 'Van Siclen Av'},
                'A54': {'childStops': ['A54N', 'A54S'], 'stopName': 'Shepherd Av'},
                'A55': {'childStops': ['A55N', 'A55S'], 'stopName': 'Euclid Av'},
                'A57': {'childStops': ['A57N', 'A57S'], 'stopName': 'Grant Av'},
                'A59': {'childStops': ['A59N', 'A59S'], 'stopName': '80 St'},
                'A60': {'childStops': ['A60N', 'A60S'], 'stopName': '88 St'},
                'A61': {'childStops': ['A61N', 'A61S'], 'stopName': 'Rockaway Blvd'},
                'A63': {'childStops': ['A63N', 'A63S'], 'stopName': '104 St'},
                'A64': {'childStops': ['A64N', 'A64S'], 'stopName': '111 St'},
                'A65': {'childStops': ['A65N', 'A65S'], 'stopName': 'Ozone Park-Lefferts Blvd'},
                'B04': {'childStops': ['B04N', 'B04S'], 'stopName': '21 St-Queensbridge'},
                'B06': {'childStops': ['B06N', 'B06S'], 'stopName': 'Roosevelt Island'},
                'B08': {'childStops': ['B08N', 'B08S'], 'stopName': 'Lexington Av/63 St'},
                'B10': {'childStops': ['B10N', 'B10S'], 'stopName': '57 St'},
                'B12': {'childStops': ['B12N', 'B12S'], 'stopName': '9 Av'},
                'B13': {'childStops': ['B13N', 'B13S'], 'stopName': 'Fort Hamilton Pkwy'},
                'B14': {'childStops': ['B14N', 'B14S'], 'stopName': '50 St'},
                'B15': {'childStops': ['B15N', 'B15S'], 'stopName': '55 St'},
                'B16': {'childStops': ['B16N', 'B16S'], 'stopName': '62 St'},
                'B17': {'childStops': ['B17N', 'B17S'], 'stopName': '71 St'},
                'B18': {'childStops': ['B18N', 'B18S'], 'stopName': '79 St'},
                'B19': {'childStops': ['B19N', 'B19S'], 'stopName': '18 Av'},
                'B20': {'childStops': ['B20N', 'B20S'], 'stopName': '20 Av'},
                'B21': {'childStops': ['B21N', 'B21S'], 'stopName': 'Bay Pkwy'},
                'B22': {'childStops': ['B22N', 'B22S'], 'stopName': '25 Av'},
                'B23': {'childStops': ['B23N', 'B23S'], 'stopName': 'Bay 50 St'},
                'D01': {'childStops': ['D01N', 'D01S'], 'stopName': 'Norwood-205 St'},
                'D03': {'childStops': ['D03N', 'D03S'], 'stopName': 'Bedford Park Blvd'},
                'D04': {'childStops': ['D04N', 'D04S'], 'stopName': 'Kingsbridge Rd'},
                'D05': {'childStops': ['D05N', 'D05S'], 'stopName': 'Fordham Rd'},
                'D06': {'childStops': ['D06N', 'D06S'], 'stopName': '182-183 Sts'},
                'D07': {'childStops': ['D07N', 'D07S'], 'stopName': 'Tremont Av'},
                'D08': {'childStops': ['D08N', 'D08S'], 'stopName': '174-175 Sts'},
                'D09': {'childStops': ['D09N', 'D09S'], 'stopName': '170 St'},
                'D10': {'childStops': ['D10N', 'D10S'], 'stopName': '167 St'},
                'D11': {'childStops': ['D11N', 'D11S'], 'stopName': '161 St-Yankee Stadium'},
                'D12': {'childStops': ['D12N', 'D12S'], 'stopName': '155 St'},
                'D13': {'childStops': ['D13N', 'D13S'], 'stopName': '145 St'},
                'D14': {'childStops': ['D14N', 'D14S'], 'stopName': '7 Av'},
                'D15': {'childStops': ['D15N', 'D15S'], 'stopName': '47-50 Sts-Rockefeller Ctr'},
                'D16': {'childStops': ['D16N', 'D16S'], 'stopName': '42 St-Bryant Pk'},
                'D17': {'childStops': ['D17N', 'D17S'], 'stopName': '34 St-Herald Sq'},
                'D18': {'childStops': ['D18N', 'D18S'], 'stopName': '23 St'},
                'D19': {'childStops': ['D19N', 'D19S'], 'stopName': '14 St'},
                'D20': {'childStops': ['D20N', 'D20S'], 'stopName': 'W 4 St-Wash Sq'},
                'D21': {'childStops': ['D21N', 'D21S'], 'stopName': 'Broadway-Lafayette St'},
                'D22': {'childStops': ['D22N', 'D22S'], 'stopName': 'Grand St'},
                'D24': {'childStops': ['D24N', 'D24S'], 'stopName': 'Atlantic Av-Barclays Ctr'},
                'D25': {'childStops': ['D25N', 'D25S'], 'stopName': '7 Av'},
                'D26': {'childStops': ['D26N', 'D26S'], 'stopName': 'Prospect Park'},
                'D27': {'childStops': ['D27N', 'D27S'], 'stopName': 'Parkside Av'},
                'D28': {'childStops': ['D28N', 'D28S'], 'stopName': 'Church Av'},
                'D29': {'childStops': ['D29N', 'D29S'], 'stopName': 'Beverley Rd'},
                'D30': {'childStops': ['D30N', 'D30S'], 'stopName': 'Cortelyou Rd'},
                'D31': {'childStops': ['D31N', 'D31S'], 'stopName': 'Newkirk Plaza'},
                'D32': {'childStops': ['D32N', 'D32S'], 'stopName': 'Avenue H'},
                'D33': {'childStops': ['D33N', 'D33S'], 'stopName': 'Avenue J'},
                'D34': {'childStops': ['D34N', 'D34S'], 'stopName': 'Avenue M'},
                'D35': {'childStops': ['D35N', 'D35S'], 'stopName': 'Kings Hwy'},
                'D37': {'childStops': ['D37N', 'D37S'], 'stopName': 'Avenue U'},
                'D38': {'childStops': ['D38N', 'D38S'], 'stopName': 'Neck Rd'},
                'D39': {'childStops': ['D39N', 'D39S'], 'stopName': 'Sheepshead Bay'},
                'D40': {'childStops': ['D40N', 'D40S'], 'stopName': 'Brighton Beach'},
                'D41': {'childStops': ['D41N', 'D41S'], 'stopName': 'Ocean Pkwy'},
                'D42': {'childStops': ['D42N', 'D42S'], 'stopName': 'W 8 St-NY Aquarium'},
                'D43': {'childStops': ['D43N', 'D43S'], 'stopName': 'Coney Island-Stillwell Av'},
                'E01': {'childStops': ['E01N', 'E01S'], 'stopName': 'World Trade Center'},
                'F01': {'childStops': ['F01N', 'F01S'], 'stopName': 'Jamaica-179 St'},
                'F02': {'childStops': ['F02N', 'F02S'], 'stopName': '169 St'},
                'F03': {'childStops': ['F03N', 'F03S'], 'stopName': 'Parsons Blvd'},
                'F04': {'childStops': ['F04N', 'F04S'], 'stopName': 'Sutphin Blvd'},
                'F05': {'childStops': ['F05N', 'F05S'], 'stopName': 'Briarwood'},
                'F06': {'childStops': ['F06N', 'F06S'], 'stopName': 'Kew Gardens-Union Tpke'},
                'F07': {'childStops': ['F07N', 'F07S'], 'stopName': '75 Av'},
                'F09': {'childStops': ['F09N', 'F09S'], 'stopName': 'Court Sq-23 St'},
                'F11': {'childStops': ['F11N', 'F11S'], 'stopName': 'Lexington Av/53 St'},
                'F12': {'childStops': ['F12N', 'F12S'], 'stopName': '5 Av/53 St'},
                'F14': {'childStops': ['F14N', 'F14S'], 'stopName': '2 Av'},
                'F15': {'childStops': ['F15N', 'F15S'], 'stopName': 'Delancey St-Essex St'},
                'F16': {'childStops': ['F16N', 'F16S'], 'stopName': 'East Broadway'},
                'F18': {'childStops': ['F18N', 'F18S'], 'stopName': 'York St'},
                'F20': {'childStops': ['F20N', 'F20S'], 'stopName': 'Bergen St'},
                'F21': {'childStops': ['F21N', 'F21S'], 'stopName': 'Carroll St'},
                'F22': {'childStops': ['F22N', 'F22S'], 'stopName': 'Smith-9 Sts'},
                'F23': {'childStops': ['F23N', 'F23S'], 'stopName': '4 Av-9 St'},
                'F24': {'childStops': ['F24N', 'F24S'], 'stopName': '7 Av'},
                'F25': {'childStops': ['F25N', 'F25S'], 'stopName': '15 St-Prospect Park'},
                'F26': {'childStops': ['F26N', 'F26S'], 'stopName': 'Fort Hamilton Pkwy'},
                'F27': {'childStops': ['F27N', 'F27S'], 'stopName': 'Church Av'},
                'F29': {'childStops': ['F29N', 'F29S'], 'stopName': 'Ditmas Av'},
                'F30': {'childStops': ['F30N', 'F30S'], 'stopName': '18 Av'},
                'F31': {'childStops': ['F31N', 'F31S'], 'stopName': 'Avenue I'},
                'F32': {'childStops': ['F32N', 'F32S'], 'stopName': 'Bay Pkwy'},
                'F33': {'childStops': ['F33N', 'F33S'], 'stopName': 'Avenue N'},
                'F34': {'childStops': ['F34N', 'F34S'], 'stopName': 'Avenue P'},
                'F35': {'childStops': ['F35N', 'F35S'], 'stopName': 'Kings Hwy'},
                'F36': {'childStops': ['F36N', 'F36S'], 'stopName': 'Avenue U'},
                'F38': {'childStops': ['F38N', 'F38S'], 'stopName': 'Avenue X'},
                'F39': {'childStops': ['F39N', 'F39S'], 'stopName': 'Neptune Av'},
                'G05': {'childStops': ['G05N', 'G05S'], 'stopName': 'Jamaica Center-Parsons/Archer'},
                'G06': {'childStops': ['G06N', 'G06S'], 'stopName': 'Sutphin Blvd-Archer Av-JFK Airport'},
                'G07': {'childStops': ['G07N', 'G07S'], 'stopName': 'Jamaica-Van Wyck'},
                'G08': {'childStops': ['G08N', 'G08S'], 'stopName': 'Forest Hills-71 Av'},
                'G09': {'childStops': ['G09N', 'G09S'], 'stopName': '67 Av'},
                'G10': {'childStops': ['G10N', 'G10S'], 'stopName': '63 Dr-Rego Park'},
                'G11': {'childStops': ['G11N', 'G11S'], 'stopName': 'Woodhaven Blvd'},
                'G12': {'childStops': ['G12N', 'G12S'], 'stopName': 'Grand Av-Newtown'},
                'G13': {'childStops': ['G13N', 'G13S'], 'stopName': 'Elmhurst Av'},
                'G14': {'childStops': ['G14N', 'G14S'], 'stopName': 'Jackson Hts-Roosevelt Av'},
                'G15': {'childStops': ['G15N', 'G15S'], 'stopName': '65 St'},
                'G16': {'childStops': ['G16N', 'G16S'], 'stopName': 'Northern Blvd'},
                'G18': {'childStops': ['G18N', 'G18S'], 'stopName': '46 St'},
                'G19': {'childStops': ['G19N', 'G19S'], 'stopName': 'Steinway St'},
                'G20': {'childStops': ['G20N', 'G20S'], 'stopName': '36 St'},
                'G21': {'childStops': ['G21N', 'G21S'], 'stopName': 'Queens Plaza'},
                'G22': {'childStops': ['G22N', 'G22S'], 'stopName': 'Court Sq'},
                'G24': {'childStops': ['G24N', 'G24S'], 'stopName': '21 St'},
                'G26': {'childStops': ['G26N', 'G26S'], 'stopName': 'Greenpoint Av'},
                'G28': {'childStops': ['G28N', 'G28S'], 'stopName': 'Nassau Av'},
                'G29': {'childStops': ['G29N', 'G29S'], 'stopName': 'Metropolitan Av'},
                'G30': {'childStops': ['G30N', 'G30S'], 'stopName': 'Broadway'},
                'G31': {'childStops': ['G31N', 'G31S'], 'stopName': 'Flushing Av'},
                'G32': {'childStops': ['G32N', 'G32S'], 'stopName': 'Myrtle-Willoughby Avs'},
                'G33': {'childStops': ['G33N', 'G33S'], 'stopName': 'Bedford-Nostrand Avs'},
                'G34': {'childStops': ['G34N', 'G34S'], 'stopName': 'Classon Av'},
                'G35': {'childStops': ['G35N', 'G35S'], 'stopName': 'Clinton-Washington Avs'},
                'G36': {'childStops': ['G36N', 'G36S'], 'stopName': 'Fulton St'},
                'H01': {'childStops': ['H01N', 'H01S'], 'stopName': 'Aqueduct Racetrack'},
                'H02': {'childStops': ['H02N', 'H02S'], 'stopName': 'Aqueduct-N Conduit Av'},
                'H03': {'childStops': ['H03N', 'H03S'], 'stopName': 'Howard Beach-JFK Airport'},
                'H04': {'childStops': ['H04N', 'H04S'], 'stopName': 'Broad Channel'},
                'H06': {'childStops': ['H06N', 'H06S'], 'stopName': 'Beach 67 St'},
                'H07': {'childStops': ['H07N', 'H07S'], 'stopName': 'Beach 60 St'},
                'H08': {'childStops': ['H08N', 'H08S'], 'stopName': 'Beach 44 St'},
                'H09': {'childStops': ['H09N', 'H09S'], 'stopName': 'Beach 36 St'},
                'H10': {'childStops': ['H10N', 'H10S'], 'stopName': 'Beach 25 St'},
                'H11': {'childStops': ['H11N', 'H11S'], 'stopName': 'Far Rockaway-Mott Av'},
                'H12': {'childStops': ['H12N', 'H12S'], 'stopName': 'Beach 90 St'},
                'H13': {'childStops': ['H13N', 'H13S'], 'stopName': 'Beach 98 St'},
                'H14': {'childStops': ['H14N', 'H14S'], 'stopName': 'Beach 105 St'},
                'H15': {'childStops': ['H15N', 'H15S'], 'stopName': 'Rockaway Park-Beach 116 St'},
                'H19': {'childStops': ['H19N', 'H19S'], 'stopName': 'Broad Channel'},
                'J12': {'childStops': ['J12N', 'J12S'], 'stopName': '121 St'},
                'J13': {'childStops': ['J13N', 'J13S'], 'stopName': '111 St'},
                'J14': {'childStops': ['J14N', 'J14S'], 'stopName': '104 St'},
                'J15': {'childStops': ['J15N', 'J15S'], 'stopName': 'Woodhaven Blvd'},
                'J16': {'childStops': ['J16N', 'J16S'], 'stopName': '85 St-Forest Pkwy'},
                'J17': {'childStops': ['J17N', 'J17S'], 'stopName': '75 St-Elderts Ln'},
                'J19': {'childStops': ['J19N', 'J19S'], 'stopName': 'Cypress Hills'},
                'J20': {'childStops': ['J20N', 'J20S'], 'stopName': 'Crescent St'},
                'J21': {'childStops': ['J21N', 'J21S'], 'stopName': 'Norwood Av'},
                'J22': {'childStops': ['J22N', 'J22S'], 'stopName': 'Cleveland St'},
                'J23': {'childStops': ['J23N', 'J23S'], 'stopName': 'Van Siclen Av'},
                'J24': {'childStops': ['J24N', 'J24S'], 'stopName': 'Alabama Av'},
                'J27': {'childStops': ['J27N', 'J27S'], 'stopName': 'Broadway Junction'},
                'J28': {'childStops': ['J28N', 'J28S'], 'stopName': 'Chauncey St'},
                'J29': {'childStops': ['J29N', 'J29S'], 'stopName': 'Halsey St'},
                'J30': {'childStops': ['J30N', 'J30S'], 'stopName': 'Gates Av'},
                'J31': {'childStops': ['J31N', 'J31S'], 'stopName': 'Kosciuszko St'},
                'L01': {'childStops': ['L01N', 'L01S'], 'stopName': '8 Av'},
                'L02': {'childStops': ['L02N', 'L02S'], 'stopName': '6 Av'},
                'L03': {'childStops': ['L03N', 'L03S'], 'stopName': '14 St-Union Sq'},
                'L05': {'childStops': ['L05N', 'L05S'], 'stopName': '3 Av'},
                'L06': {'childStops': ['L06N', 'L06S'], 'stopName': '1 Av'},
                'L08': {'childStops': ['L08N', 'L08S'], 'stopName': 'Bedford Av'},
                'L10': {'childStops': ['L10N', 'L10S'], 'stopName': 'Lorimer St'},
                'L11': {'childStops': ['L11N', 'L11S'], 'stopName': 'Graham Av'},
                'L12': {'childStops': ['L12N', 'L12S'], 'stopName': 'Grand St'},
                'L13': {'childStops': ['L13N', 'L13S'], 'stopName': 'Montrose Av'},
                'L14': {'childStops': ['L14N', 'L14S'], 'stopName': 'Morgan Av'},
                'L15': {'childStops': ['L15N', 'L15S'], 'stopName': 'Jefferson St'},
                'L16': {'childStops': ['L16N', 'L16S'], 'stopName': 'DeKalb Av'},
                'L17': {'childStops': ['L17N', 'L17S'], 'stopName': 'Myrtle-Wyckoff Avs'},
                'L19': {'childStops': ['L19N', 'L19S'], 'stopName': 'Halsey St'},
                'L20': {'childStops': ['L20N', 'L20S'], 'stopName': 'Wilson Av'},
                'L21': {'childStops': ['L21N', 'L21S'], 'stopName': 'Bushwick Av-Aberdeen St'},
                'L22': {'childStops': ['L22N', 'L22S'], 'stopName': 'Broadway Junction'},
                'L24': {'childStops': ['L24N', 'L24S'], 'stopName': 'Atlantic Av'},
                'L25': {'childStops': ['L25N', 'L25S'], 'stopName': 'Sutter Av'},
                'L26': {'childStops': ['L26N', 'L26S'], 'stopName': 'Livonia Av'},
                'L27': {'childStops': ['L27N', 'L27S'], 'stopName': 'New Lots Av'},
                'L28': {'childStops': ['L28N', 'L28S'], 'stopName': 'East 105 St'},
                'L29': {'childStops': ['L29N', 'L29S'], 'stopName': 'Canarsie-Rockaway Pkwy'},
                'M01': {'childStops': ['M01N', 'M01S'], 'stopName': 'Middle Village-Metropolitan Av'},
                'M04': {'childStops': ['M04N', 'M04S'], 'stopName': 'Fresh Pond Rd'},
                'M05': {'childStops': ['M05N', 'M05S'], 'stopName': 'Forest Av'},
                'M06': {'childStops': ['M06N', 'M06S'], 'stopName': 'Seneca Av'},
                'M08': {'childStops': ['M08N', 'M08S'], 'stopName': 'Myrtle-Wyckoff Avs'},
                'M09': {'childStops': ['M09N', 'M09S'], 'stopName': 'Knickerbocker Av'},
                'M10': {'childStops': ['M10N', 'M10S'], 'stopName': 'Central Av'},
                'M11': {'childStops': ['M11N', 'M11S'], 'stopName': 'Myrtle Av'},
                'M12': {'childStops': ['M12N', 'M12S'], 'stopName': 'Flushing Av'},
                'M13': {'childStops': ['M13N', 'M13S'], 'stopName': 'Lorimer St'},
                'M14': {'childStops': ['M14N', 'M14S'], 'stopName': 'Hewes St'},
                'M16': {'childStops': ['M16N', 'M16S'], 'stopName': 'Marcy Av'},
                'M18': {'childStops': ['M18N', 'M18S'], 'stopName': 'Delancey St-Essex St'},
                'M19': {'childStops': ['M19N', 'M19S'], 'stopName': 'Bowery'},
                'M20': {'childStops': ['M20N', 'M20S'], 'stopName': 'Canal St'},
                'M21': {'childStops': ['M21N', 'M21S'], 'stopName': 'Chambers St'},
                'M22': {'childStops': ['M22N', 'M22S'], 'stopName': 'Fulton St'},
                'M23': {'childStops': ['M23N', 'M23S'], 'stopName': 'Broad St'},
                'N02': {'childStops': ['N02N', 'N02S'], 'stopName': '8 Av'},
                'N03': {'childStops': ['N03N', 'N03S'], 'stopName': 'Fort Hamilton Pkwy'},
                'N04': {'childStops': ['N04N', 'N04S'], 'stopName': 'New Utrecht Av'},
                'N05': {'childStops': ['N05N', 'N05S'], 'stopName': '18 Av'},
                'N06': {'childStops': ['N06N', 'N06S'], 'stopName': '20 Av'},
                'N07': {'childStops': ['N07N', 'N07S'], 'stopName': 'Bay Pkwy'},
                'N08': {'childStops': ['N08N', 'N08S'], 'stopName': 'Kings Hwy'},
                'N09': {'childStops': ['N09N', 'N09S'], 'stopName': 'Avenue U'},
                'N10': {'childStops': ['N10N', 'N10S'], 'stopName': '86 St'},
                'N12': {'childStops': ['N12N', 'N12S'], 'stopName': 'S.B. Coney Island'},
                'Q01': {'childStops': ['Q01N', 'Q01S'], 'stopName': 'Canal St'},
                'Q03': {'childStops': ['Q03N', 'Q03S'], 'stopName': '72 St'},
                'Q04': {'childStops': ['Q04N', 'Q04S'], 'stopName': '86 St'},
                'Q05': {'childStops': ['Q05N', 'Q05S'], 'stopName': '96 St'},
                'R01': {'childStops': ['R01N', 'R01S'], 'stopName': 'Astoria-Ditmars Blvd'},
                'R03': {'childStops': ['R03N', 'R03S'], 'stopName': 'Astoria Blvd'},
                'R04': {'childStops': ['R04N', 'R04S'], 'stopName': '30 Av'},
                'R05': {'childStops': ['R05N', 'R05S'], 'stopName': 'Broadway'},
                'R06': {'childStops': ['R06N', 'R06S'], 'stopName': '36 Av'},
                'R08': {'childStops': ['R08N', 'R08S'], 'stopName': '39 Av-Dutch Kills'},
                'R09': {'childStops': ['R09N', 'R09S'], 'stopName': 'Queensboro Plaza'},
                'R11': {'childStops': ['R11N', 'R11S'], 'stopName': 'Lexington Av/59 St'},
                'R13': {'childStops': ['R13N', 'R13S'], 'stopName': '5 Av/59 St'},
                'R14': {'childStops': ['R14N', 'R14S'], 'stopName': '57 St-7 Av'},
                'R15': {'childStops': ['R15N', 'R15S'], 'stopName': '49 St'},
                'R16': {'childStops': ['R16N', 'R16S'], 'stopName': 'Times Sq-42 St'},
                'R17': {'childStops': ['R17N', 'R17S'], 'stopName': '34 St-Herald Sq'},
                'R18': {'childStops': ['R18N', 'R18S'], 'stopName': '28 St'},
                'R19': {'childStops': ['R19N', 'R19S'], 'stopName': '23 St'},
                'R20': {'childStops': ['R20N', 'R20S'], 'stopName': '14 St-Union Sq'},
                'R21': {'childStops': ['R21N', 'R21S'], 'stopName': '8 St-NYU'},
                'R22': {'childStops': ['R22N', 'R22S'], 'stopName': 'Prince St'},
                'R23': {'childStops': ['R23N', 'R23S'], 'stopName': 'Canal St'},
                'R24': {'childStops': ['R24N', 'R24S'], 'stopName': 'City Hall'},
                'R25': {'childStops': ['R25N', 'R25S'], 'stopName': 'Cortlandt St'},
                'R26': {'childStops': ['R26N', 'R26S'], 'stopName': 'Rector St'},
                'R27': {'childStops': ['R27N', 'R27S'], 'stopName': 'Whitehall St-South Ferry'},
                'R28': {'childStops': ['R28N', 'R28S'], 'stopName': 'Court St'},
                'R29': {'childStops': ['R29N', 'R29S'], 'stopName': 'Jay St-MetroTech'},
                'R30': {'childStops': ['R30N', 'R30S'], 'stopName': 'DeKalb Av'},
                'R31': {'childStops': ['R31N', 'R31S'], 'stopName': 'Atlantic Av-Barclays Ctr'},
                'R32': {'childStops': ['R32N', 'R32S'], 'stopName': 'Union St'},
                'R33': {'childStops': ['R33N', 'R33S'], 'stopName': '4 Av-9 St'},
                'R34': {'childStops': ['R34N', 'R34S'], 'stopName': 'Prospect Av'},
                'R35': {'childStops': ['R35N', 'R35S'], 'stopName': '25 St'},
                'R36': {'childStops': ['R36N', 'R36S'], 'stopName': '36 St'},
                'R39': {'childStops': ['R39N', 'R39S'], 'stopName': '45 St'},
                'R40': {'childStops': ['R40N', 'R40S'], 'stopName': '53 St'},
                'R41': {'childStops': ['R41N', 'R41S'], 'stopName': '59 St'},
                'R42': {'childStops': ['R42N', 'R42S'], 'stopName': 'Bay Ridge Av'},
                'R43': {'childStops': ['R43N', 'R43S'], 'stopName': '77 St'},
                'R44': {'childStops': ['R44N', 'R44S'], 'stopName': '86 St'},
                'R45': {'childStops': ['R45N', 'R45S'], 'stopName': 'Bay Ridge-95 St'},
                'S01': {'childStops': ['S01N', 'S01S'], 'stopName': 'Franklin Av'},
                'S03': {'childStops': ['S03N', 'S03S'], 'stopName': 'Park Pl'},
                'S04': {'childStops': ['S04N', 'S04S'], 'stopName': 'Botanic Garden'},
                'S09': {'childStops': ['S09N', 'S09S'], 'stopName': 'Tottenville'},
                'S11': {'childStops': ['S11N', 'S11S'], 'stopName': 'Arthur Kill'},
                'S13': {'childStops': ['S13N', 'S13S'], 'stopName': 'Richmond Valley'},
                'S14': {'childStops': ['S14N', 'S14S'], 'stopName': 'Pleasant Plains'},
                'S15': {'childStops': ['S15N', 'S15S'], 'stopName': "Prince's Bay"},
                'S16': {'childStops': ['S16N', 'S16S'], 'stopName': 'Huguenot'},
                'S17': {'childStops': ['S17N', 'S17S'], 'stopName': 'Annadale'},
                'S18': {'childStops': ['S18N', 'S18S'], 'stopName': 'Eltingville'},
                'S19': {'childStops': ['S19N', 'S19S'], 'stopName': 'Great Kills'},
                'S20': {'childStops': ['S20N', 'S20S'], 'stopName': 'Bay Terrace'},
                'S21': {'childStops': ['S21N', 'S21S'], 'stopName': 'Oakwood Heights'},
                'S22': {'childStops': ['S22N', 'S22S'], 'stopName': 'New Dorp'},
                'S23': {'childStops': ['S23N', 'S23S'], 'stopName': 'Grant City'},
                'S24': {'childStops': ['S24N', 'S24S'], 'stopName': 'Jefferson Av'},
                'S25': {'childStops': ['S25N', 'S25S'], 'stopName': 'Dongan Hills'},
                'S26': {'childStops': ['S26N', 'S26S'], 'stopName': 'Old Town'},
                'S27': {'childStops': ['S27N', 'S27S'], 'stopName': 'Grasmere'},
                'S28': {'childStops': ['S28N', 'S28S'], 'stopName': 'Clifton'},
                'S29': {'childStops': ['S29N', 'S29S'], 'stopName': 'Stapleton'},
                'S30': {'childStops': ['S30N', 'S30S'], 'stopName': 'Tompkinsville'},
                'S31': {'childStops': ['S31N', 'S31S'], 'stopName': 'St George'}
            };  
            this.MTATrainTimesNodeHelper = new MTATrainTimesNodeHelper(
                this.apiBases,
                this.parentStops,
                this.sendSocketNotification.bind(this)
            )
        },

        socketNotificationReceived: function (notification, payload) {
            if (this.MTATrainTimesNodeHelper) {
                this.MTATrainTimesNodeHelper.socketNotificationReceived(notification, payload);
            }
        }
    });
}