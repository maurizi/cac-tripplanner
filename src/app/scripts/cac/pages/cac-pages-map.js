CAC.Pages.Map = (function ($, Handlebars, _, moment, MapControl, Routing, MockDestinations, MapTemplates, UserPreferences) {
    'use strict';

    var defaults = {
        map: {}
    };
    var mapControl = null;
    var currentItinerary = null;
    var datepicker = null;

    var directions = {
        origin: null,
        destination: null
    };

    function Map(options) {
        this.options = $.extend({}, defaults, options);
    }

    Map.prototype.initialize = function () {

        // Map initialization logic and event binding
        mapControl = new MapControl();
        mapControl.drawDestinations(MockDestinations);
        mapControl.locateUser();


        // Plan a trip using information provided
        $('section.directions button[type=submit]').click($.proxy(planTrip, this));

        // Show isochrone in discovery tab
        $('section.explore button[type=submit]').click($.proxy(fetchIsochrone, this));

        $('.sidebar-search button[type="submit"]').on('click', function(){
            $('.explore').addClass('show-results');
        });

        $('.sidebar-options .view-more').click(showOptions);

        // initiallize date/time picker
        datepicker = $('#datetimeDirections').datetimepicker({useCurrent: true});

        $('#sidebar-toggle-directions').on('click', function(){
            $('.explore').addClass('hidden');
            $('.directions').removeClass('hidden');
            // remove isochrone and destination layers
            mapControl.setGeocodeMarker(null);
        });

        $('#sidebar-toggle-explore').on('click', function(){
            $('.directions').addClass('hidden');
            $('.explore').removeClass('hidden');
        });

        this.typeahead  = new CAC.Search.Typeahead('input.typeahead');
        this.typeahead.events.on('cac:typeahead:selected', $.proxy(onTypeaheadSelected, this));

        setFromUserPreferences();
    };

    return Map;

    function showOptions(event) {
        var parent = $(event.target).closest('section');
        var moreOpt = $('.sidebar-options .more-options', parent);

        $(moreOpt).toggleClass('active');
        $(moreOpt).parent().find('a.view-more').text(function() {
            if($(moreOpt).hasClass('active')){
                return 'View fewer options';
            } else {
                return 'View more options';
            }
        });
    }

    function planTrip() {
        if (!(directions.origin && directions.destination)) {
            setDirectionsError();
            return;
        }

        var picker = $('#datetimeDirections').data('DateTimePicker');
        var date = picker.date();
        if (!date) {
            // use current date/time if none set
            date = moment();
        }

        var mode = $('#directionsModeSelector').val();

        var origin = directions.origin;
        var destination = directions.destination;

        var arriveBy = true;
        if ($('input[name="arriveBy"]:checked').val() !== 'arriveBy') {
            arriveBy = false; // depart at time instead
        }

        Routing.planTrip(origin, destination, date, mode, arriveBy).then(function (itineraries) {
            // Add the itineraries to the map, highlighting the first one
            var highlight = true;
            mapControl.clearItineraries();
            _.forIn(itineraries, function (itinerary) {
                mapControl.plotItinerary(itinerary);
                itinerary.highlight(highlight);
                if (highlight) {
                    currentItinerary = itinerary;
                    highlight = false;
                }
            });

            // Show the directions div and populate with itineraries
            var html = MapTemplates.itinerarySummaries(itineraries);
            $('.itineraries').html(html);
            $('a.itinerary').on('click', onItineraryClicked);
            $('.block-itinerary').on('click', onItineraryClicked);
            $('.directions').addClass('show-results');
        });
    }

    /**
     * Handles click events to highlight a given itinerary
     * Event handler, so this is set to the clicked event
     */
    function onItineraryClicked() {
        var itineraryId = this.getAttribute('data-itinerary');
        var itinerary = mapControl.getItineraryById(itineraryId);
        if (itinerary) {
            currentItinerary.highlight(false);
            itinerary.highlight(true);
            currentItinerary = itinerary;
        }
    }

    function onTypeaheadSelected(event, key, location) {
        // TODO: Deleting text from input elements does not delete directions object values
        if (key === 'destination') {
            directions.destination = [location.feature.geometry.y, location.feature.geometry.x];
        } else if (key === 'origin') {
            directions.origin = [location.feature.geometry.y, location.feature.geometry.x];
        } else if (key === 'search') {
            setAddress(location);
        }
    }

    function setAddress(location) {
        var latLng = L.latLng(location.feature.geometry.y, location.feature.geometry.x);
        mapControl.setGeocodeMarker(latLng);
        $('div.address > h4').html(MapTemplates.addressText(location.feature.attributes));
    }

    function setDestinationSidebar(destinations) {
        var $container = $('<div></div>').addClass('destinations');
        $.each(destinations, function (i, destination) {
            var $destination = $(CAC.Map.Templates.destinationBlock(destination));
            $destination.click(function () {
                // TODO: What to do on click?!?!
            });
            $container.append($destination);
        });
        $('.explore div.sidebar-details').empty().append($container);
        $('.explore .sidebar-clip').height(400);
    }

    function setDirectionsError() {
        var errorClass = 'error';
        var $inputOrigin = $('section.directions input.origin');
        var $inputDestination = $('section.directions input.destination');
        if (directions.origin) {
            $inputOrigin.removeClass(errorClass);
        } else {
            $inputOrigin.addClass(errorClass);
        }
        if (directions.destination) {
            $inputDestination.removeClass(errorClass);
        } else {
            $inputDestination.addClass(errorClass);
        }
    }

    function fetchIsochrone() {
        mapControl.fetchIsochrone().then(function (destinations) {
            setDestinationSidebar(destinations);
        });
    }

    /**
     * When first naviagting to this page, check for user preferences to load.
     */
    function setFromUserPreferences() {
        var method = UserPreferences.getPreference('method');
        if (!method) {
            return; // no user preferences set
        }

        var mode = UserPreferences.getPreference('mode');

        if (method === 'directions') {
            // switch tabs
            $('.explore').addClass('hidden');
            $('.directions').removeClass('hidden');

            var from = UserPreferences.getPreference('from');
            var to = UserPreferences.getPreference('to');
            var fromText = UserPreferences.getPreference('fromText');
            var toText = UserPreferences.getPreference('toText');
            if (from) {
                directions.origin = [from.feature.geometry.y, from.feature.geometry.x];
            } else {
                // use current location if no directions origin set
                MapControl.locateUser().then(function(data) {
                    directions.destination = [data[1], data[0]];
                }, function(error) {
                    console.log('Could not geolocate user');
                    console.error(error);
                    return;
                });
            }

            directions.destination = [to.feature.geometry.y, to.feature.geometry.x];
            $('section.directions input.origin').val(fromText);
            $('section.directions input.destination').val(toText);
            $('#directionsModeSelector').val(mode);
            planTrip();
        } else {
            // 'explore' tab
            var origin = UserPreferences.getPreference('origin');
            var originText = UserPreferences.getPreference('originText');
            var exploreTime = UserPreferences.getPreference('exploreTime');
            $('#exploreOrigin').val(originText);
            setAddress(origin);
            $('#exploreTime').val(exploreTime);
            $('#exploreModeSelector').val(mode);
            fetchIsochrone();
        }
    }

})(jQuery, Handlebars, _, moment, CAC.Map.Control, CAC.Routing.Plans, CAC.Mock.Destinations,
   CAC.Map.Templates, CAC.User.Preferences);
