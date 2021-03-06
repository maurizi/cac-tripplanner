CAC.Routing.Itinerary = (function ($, cartodb, L, _, moment, Geocoder, Utils) {
    'use strict';

    /**
     * Class represents an itinerary between two points
     *
     * @param {object} otpItinerary OTP itinerary
     * @param {integer} index integer to uniquely identify itinerary
     */
    function Itinerary(otpItinerary, index) {
        // extract reverse-geocoded start and end addresses
        var params = Utils.getUrlParams();
        this.fromText = params.originText;
        this.toText = params.destinationText;

        // array of turf points, for ease of use both making into a
        // Leaflet layer as GeoJSON, and for interpolating new waypoints.
        this.waypoints = getWaypointFeatures(params.waypoints);

        this.id = index.toString();
        this.via = getVia(otpItinerary.legs);
        this.modes = getModes(otpItinerary.legs);
        this.modeSummaries = getModeSummaries(otpItinerary.legs);
        this.formattedDistance = getFormattedItineraryDistance(otpItinerary.legs);
        this.formattedDuration = getFormattedDuration(otpItinerary.duration);
        this.duration = otpItinerary.duration;
        this.startTime = otpItinerary.startTime;
        this.endTime = otpItinerary.endTime;
        this.legs = getLegs(otpItinerary.legs, (this.waypoints && this.waypoints.length > 0));
        this.from = _.head(otpItinerary.legs).from;
        this.to = _.last(otpItinerary.legs).to;
        this.agencies = getTransitAgencies(otpItinerary.legs);

        // not actually GeoJSON, but a Leaflet layer made from GeoJSON
        this.geojson = cartodb.L.geoJson({type: 'FeatureCollection',
                                          features: this.getFeatures(otpItinerary.legs)});

        // expose method to change linestring styling
        this.setLineColors = setLineColors;

        // default to visible, backgrounded linestring styling
        this.setLineColors(true, false);

        // set by CAC.Routing.Plans with the arguments sent to planTrip:
        // coordsFrom, coordsTo, when, extraOptions
        // (not used by directions list page)
        this.routingParams = null;

        // only show summary of mode types if more than one mode in use for more than the
        // minimum travel distance to display
        this.showSummaryModes = _.keys(this.modeSummaries).length > 1;
        if (this.modeSummaries.TRANSIT && otpItinerary.transfers > 0) {
            // set the number of transfers on the mode summary, if transit taken
            this.modeSummaries.TRANSIT.transfers = otpItinerary.transfers + ' xfer';
            if (otpItinerary.transfers > 1) {
                // pluralize
                this.modeSummaries.TRANSIT.transfers += 's';
            }
        }
    }

    Itinerary.prototype.highlight = function(isHighlighted) {
        this.setLineColors(true, isHighlighted);
    };

    Itinerary.prototype.show = function(isShown) {
        this.setLineColors(isShown, false);
    };

    /**
     * Get geoJSON for an itinerary. Also updates `from` and `to` points while building geoJSON.
     *
     * Use intermediate leg polyline objects to find start and end of actual route.
     * `from` and `to` as returned from OTP are the requested start and end points;
     * find the actually routable start and end to trip from the polyline(s).
     *
     * @param {array} legs set of legs for an OTP itinerary
     * @return {array} array of geojson features
     */
    Itinerary.prototype.getFeatures = function(legs) {
        var self = this;
        var lastIndex = legs.length - 1;
        var linestrings = _.map(legs, function(leg, index) {
            var linestring = L.Polyline.fromEncoded(leg.legGeometry.points);
            if (index === 0 || index === lastIndex) {
                var coords = linestring.getLatLngs();
                if (!coords.length) {
                    return;
                }
                if (index === 0) {
                    self.from.lat = coords[0].lat;
                    self.from.lon = coords[0].lng;
                }
                if (index === lastIndex) {
                    var end = _.last(coords);
                    self.to.lat = end.lat;
                    self.to.lon = end.lng;
                }
            }
            var linestringGeoJson = linestring.toGeoJSON();
            linestringGeoJson.properties = leg;
            return linestringGeoJson;
        });

        return linestrings;
    };

    // cache of geocoded OSM nodes (node name mapped to reverse geocode name)
    var nodeCache = {};

    return Itinerary;

    /**
     * Find transit agency names for this itinerary.
     *
     * @param {array} legs Legs property of OTP itinerary
     * @return {array} List of unique agency names traversed in this itinerary
     */
    function getTransitAgencies(legs) {
        return _.chain(legs).map('agencyName').uniq().without(undefined).value();
    }

    /**
     * Helper function to get label/via summary for an itinerary.
     * Chooses the streetname with the longest distance for an
     * itinerary.
     *
     * @param {array} legs Legs property of OTP itinerary
     * @return {string} string to use for labeling an itinerary
     */
    function getVia(legs) {
        return _.chain(legs).map('steps').flatten().max(function(step) {
            return step.distance;
        }).value().streetName;
    }

    /**
     * Helper function to get list of modes used by an itinerary
     *
     * @param {array} legs Legs property of OTP itinerary
     * @return {array} array of strings representing modes for itinerary
     */
    function getModes(legs) {
        return _.chain(legs).map('mode').uniq().value();
    }

    /**
     * Helper function to get the total travel time and distance for each mode in the itinerary.
     *
     * @param {array} legs Legs property of OTP itinerary
     * @return {object} Mode keys mapped to formatted and raw total distance and duration
     */
    function getModeSummaries(legs) {
        // minimum length of travel via a given mode for it to show up in the summary
        // (about a city block)
        var MIN_MODE_LENGTH_METERS = 120;

        // In case all legs are shorter than the minimum, keep the longest leg
        var farthest = 0;

        return _.chain(legs).groupBy(function(leg) {
            return leg.transitLeg ? 'TRANSIT' : leg.mode;
        }).mapValues(function(modeLegs) {
            var dist = _.sumBy(modeLegs, 'distance');
            var time = _.sumBy(modeLegs, 'duration');
            if (dist > farthest) {
                farthest = dist;
            }
            return {distance: dist,
                    duration: time,
                    formattedDistance: Utils.getFormattedDistance(dist),
                    formattedDuration: getFormattedDuration(time)
            };
        }).pickBy(function(summary) {
            return summary.distance > MIN_MODE_LENGTH_METERS || summary.distance === farthest;
        }).value();
    }

    /**
     * Helper function to get total distance in feet or miles for an itinerary
     *
     * @param {array} legs Legs property of OTP itinerary
     * @return {string} distance of itinerary in miles (rounded to 2nd decimal), or,
     *                 if less than .2 mile, in feet (rounded to nearest foot); includes unit.
     */
    function getFormattedItineraryDistance(legs) {
        return Utils.getFormattedDistance(_.sumBy(legs, 'distance'));
    }

    /**
     * Helper function to get formatted duration string for an itinerary or leg
     *
     * @param {object} duration Duration in seconds, as on OTP itinerary or leg
     * @return {string} duration of itinerary/leg, formatted with units (hrs, min, s)
     */
    function getFormattedDuration(seconds) {
        var duration = moment.duration(seconds, 'seconds');

        // For durations less than a day and greater than an hour, format to display both
        // hours and minutes.
        if (duration.hours() > 0 && duration.minutes() > 0 && duration.days() < 1) {
            return duration.hours() + 'h ' + duration.minutes() + 'm';
        }

        return duration.humanize();
    }

    /**
     * Helper to parse semicolon-delimited list of waypoints into
     * array of GeoJSON point features.
     *
     * @param {string} waypoints from URL
     * @return {array} GeoJSON features
     */
    function getWaypointFeatures(waypoints) {
        if (!waypoints) {
            return null;
        }

        // explicitly set the index property so it will populate on the geoJSON properties
        // when point array used to create FeatureCollection
        return _.map(waypoints.split(';'), function(point, index) {
            var points = _.map(point.split(',').reverse(), function(pt) {
                // turf.point expects numeric input
                return parseFloat(pt);
            });
            return turf.point(points, {index: index});
        });
    }

    /**
     * Helper to reverse geocode OSM node labels. Caches results.
     *
     * @param {Object} place `from` or `to` object from an OTP itinerary leg
     * @returns {Object} Promise that resolves to reverse geocode result for the location
     */
    function getOsmNodeName(place) {
        var dfd = $.Deferred();

        if (_.has(nodeCache, place.name)) {
            dfd.resolve(nodeCache[place.name]);
            return dfd.promise();
        }

        // not cached; go reverse geocode it
        Geocoder.reverse(place.lat, place.lon).then(function(result) {
            nodeCache[place.name] = result.address.Address;
            dfd.resolve(result.address.Address);
        });

        return dfd.promise();
    }

    /**
     * Does some post-processing for the legs, for cleanup and template convenience
     *
     * @params {Array} legs Itinerary legs returned by OTP
     * @param {Boolean} hasWaypoints If true, call mergeLegsAcrossWaypoints
     * @returns {Array} Itinerary legs, with prettified place labels and other improvements
     */
    function getLegs(legs, hasWaypoints) {
        // Check leg from/to place name; if it's an OSM node label, reverse geocode it
        // and update label

        var newLegs = _.map(legs, function(leg) {
            if (leg.from.name.indexOf('Start point 0.') > -1) {
                getOsmNodeName(leg.from).then(function(name) {
                    leg.from.name = name;
                });
            }
            if (leg.to.name.indexOf('Start point 0.') > -1) {
                getOsmNodeName(leg.to).then(function(name) {
                    leg.to.name = name;
                });
            }
            return leg;
        });

        // If there are waypoints, call the function to merge legs across them.
        if (hasWaypoints) {
            newLegs = mergeLegsAcrossWaypoints(newLegs);
        }

        // Add some derived data to be used in the template:
        // - Format duration on leg and distance on leg and its steps
        _.forEach(newLegs, function (leg) {
            leg.formattedDistance = Utils.getFormattedDistance(leg.distance);
            leg.formattedDuration = getFormattedDuration(leg.duration);
            _.forEach(leg.steps, function(step) {
                step.formattedDistance = Utils.getFormattedDistance(step.distance);
            });
        });
        // - Set a flag on the last leg, so we can avoid diplaying arriving there right above
        //   also arriving at the final destination
        newLegs[newLegs.length - 1].lastLeg = true;
        // - And set a flag on legs that end at bike share stations (whether on a bike or walking
        //   to a station), so we can show the icon
        _.forEach(newLegs, function (leg) {
            leg.toBikeShareStation = leg.to.vertexType === 'BIKESHARE';
        });

        return newLegs;
    }

    /* Waypoints always result in a step break, which ends up producing intermediate
     * "to Destination" steps that we don't want to show in the itinerary details.
     * See https://github.com/opentripplanner/OpenTripPlanner/blob/otp-1.0.0/src/main/java/org/opentripplanner/routing/impl/GraphPathFinder.java#L305
     * and https://github.com/opentripplanner/OpenTripPlanner/blob/otp-1.0.0/src/main/java/org/opentripplanner/api/resource/GraphPathToTripPlanConverter.java#L212
     * There's no configuration option to make OTP not do that, so instead this munges the
     * resulting separate steps into one.
     * Specifically, it loops over the legs, checking for each one whether the next one is the same
     * mode and, if so, summing times/distances and resetting the 'to' to turn the first leg into
     * a combination of itself and the second.  Since there can be multiple waypoints in what would
     * be a single leg, more than two consecutive legs can end up getting merged together.
     *
     * Note that this makes no attempt to merge the `legGeometry` attributes so it's important that
     * `getFeatures`, which gets the itinerary's geometry into Leaflet, gets called on the original
     * legs array rather than the munged one.
     */
    function mergeLegsAcrossWaypoints(legs) {
        if (legs.length === 1) {
            return legs;
        }
        var index = 0;
        while(index < legs.length - 1) {
            var thisLeg = legs[index];
            var nextLeg = legs[index+1];
            if (thisLeg.mode === nextLeg.mode && !nextLeg.interlineWithPreviousLeg) {
                var newLeg = _.clone(thisLeg);
                newLeg.distance = thisLeg.distance + nextLeg.distance;
                newLeg.duration = thisLeg.duration + nextLeg.duration;
                newLeg.endTime = nextLeg.endTime;
                newLeg.to = nextLeg.to;

                // If the waypoint is in the middle of what would otherwise be a single step,
                // merge it back into a single step
                var lastStep = _.clone(_.last(thisLeg.steps));
                var nextStep = _.first(nextLeg.steps);
                if (nextStep && nextStep.relativeDirection === 'CONTINUE' &&
                        lastStep.streetName === nextStep.streetName) {
                    lastStep.distance += nextStep.distance;
                    lastStep.elevation = lastStep.elevation.concat(nextStep.elevation);
                    newLeg.steps = _.concat(_.dropRight(thisLeg.steps, 1),
                                            [lastStep],
                                            _.tail(nextLeg.steps));
                } else {
                    newLeg.steps = _.concat(thisLeg.steps, nextLeg.steps);
                }
                legs.splice(index, 2, newLeg);
            } else {
                index++;
            }
        }
        return legs;
    }

    /**
     * Helper function to set style for an itinerary
     *
     * @param {Boolean} shown Should this itinerary be shown (if false, make transparent)
     * @param {Boolean} highlighted Should this itinerary be highlighted on the map
     */
    function setLineColors(shown, highlighted) {

        if (!shown) {
            this.geojson.setStyle({opacity: 0});
            return;
        }

        var defaultStyle = {clickable: true, // to get mouse events (listen to hover)
                        color: Utils.defaultModeColor,
                        dashArray: null,
                        lineCap: 'round',
                        lineJoin: 'round',
                        opacity: 0.75};

        if (highlighted) {
            defaultStyle.dashArray = null;
            defaultStyle.opacity = 1;
            this.geojson.setStyle(defaultStyle);

            // set color for each leg based on mode
            this.geojson.eachLayer(function(layer) {
                var modeColor = Utils.getModeColor(layer.feature.properties.mode);
                layer.setStyle({color: modeColor});
            });
        } else {
            // in background
            defaultStyle.color = Utils.defaultBackgroundLineColor;
            defaultStyle.dashArray = [5, 8];
            this.geojson.setStyle(defaultStyle);
        }
    }

})(jQuery, cartodb, L, _, moment, CAC.Search.Geocoder, CAC.Utils);
