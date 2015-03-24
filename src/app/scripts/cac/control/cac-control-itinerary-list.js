/**
 *  View control for the itinerary list
 *
 */
CAC.Control.ItineraryList = (function ($, Handlebars) {

    'use strict';

    var defaults = {
        // Should the back button be shown in the control
        //  this is weird, ideally we would handle the back button in the wrapper view, but we
        //  need to switch out the sidebar div as a whole
        showBackButton: false,
        // Should the share button be shown in the control
        showShareButton: false,
        selectors: {
            container: '.itineraries'
        }
    };
    var options = {};

    var events = $({});
    var eventNames = {
        itineraryClicked: 'cac:control:itinerarylist:itineraryclicked'
    };

    var $container = null;
    var itineraries = [];

    function ItineraryListControl(params) {
        options = $.extend({}, defaults, params);

        $container = $(options.selectors.container);
    }

    ItineraryListControl.prototype = {
        events: events,
        setItineraries: setItineraries,
        show: show,
        hide: hide,
        toggle: toggle
    };

    return ItineraryListControl;

    /**
     * Set the directions list from an OTP itinerary object
     * @param {[object]} itinerary An open trip planner itinerary object, as returned from the plan endpoint
     */
    function setItineraries(newItineraries) {
        itineraries = newItineraries;
        // Show the directions div and populate with itineraries
        var html = getTemplate(itineraries);
        $container.html(html);
        $('a.itinerary').on('click', onItineraryClicked);
        $('.block-itinerary').on('click', onItineraryClicked);
    }

    // Template for itinerary summaries
    function getTemplate(itineraries) {
        Handlebars.registerHelper('modeIcon', function(modeString) {
            var modeIcons = {
                BUS: 'bus',
                SUBWAY: 'subway',
                CAR: 'car',
                TRAIN: 'train',
                BICYCLE: 'bicycle',
                WALK: 'rocket'
            };

            return new Handlebars.SafeString('<i class="fa fa-'+ modeIcons[modeString] + '"></i>');
        });

        var source = '{{#each itineraries}}' +
                '<div class="block block-itinerary" data-itinerary="{{this.id}}">' +
                '{{#each this.modes}}' +
                ' {{modeIcon this}}' +
                '{{/each}}' +
                '<span class="short-description">Via {{this.via}}</span>' +
                '<span class="trip-duration">{{this.durationMinutes}} Minutes</span>' +
                '<span class="trip-distance">{{this.distanceMiles}} mi.</span>' +
                '<p><a class="itinerary" data-itinerary="{{this.id}}">View Directions</a></p>' +
                '</div>' +
                '{{/each}}';
        var template = Handlebars.compile(source);
        var html = template({itineraries: itineraries});
        return html;
    }

    function getItineraryById(id) {
        return itineraries[id];
    }

    /**
     * Handle click event on itinerary list item, this is set to element clicked
     */
    function onItineraryClicked() {
        var itineraryId = this.getAttribute('data-itinerary');
        var itinerary = getItineraryById(itineraryId);
        events.trigger(eventNames.itineraryClicked, itinerary);
    }

    function show() {
        $container.removeClass('hidden');
    }

    function hide() {
        $container.addClass('hidden');
    }

    function toggle() {
        if ($container.hasClass('hidden')) {
            show();
        } else {
            hide();
        }
    }
})(jQuery, Handlebars);