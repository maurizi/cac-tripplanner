import json

from django.contrib.gis.geos import GEOSGeometry, MultiPolygon, Point
from django.core import serializers
from django.http import HttpResponse
from django.shortcuts import render_to_response
from django.template import RequestContext
from django.views.generic import View

import requests

from cac_tripplanner.settings import OTP_URL
from .models import Destination


def map(request):
    return render_to_response('map.html', context_instance=RequestContext(request))


class FindReachableDestinations(View):
    """Class based view for finding destinations of interest within the calculated isochrone"""
    # TODO: make decisions on acceptable ranges of values that this endpoint will support

    otp_router = 'default'
    isochrone_url = OTP_URL.format(router=otp_router) + 'isochrone'
    algorithm = 'accSampling'

    def isochrone(self, lat, lng, mode, date, time, max_travel_time, max_walk_distance):
        """Make request to Open Trip Planner for isochrone geometry with the provided args
        Take OTP JSON and convert it to GDAL MultiPolygon and return it"""
        payload = {
            'routerId': self.otp_router,
            'fromPlace': lat + ',' + lng,
            'mode': (',').join(mode),
            'date': date,
            'time': time,
            'cutoffSec': max_travel_time,
            'maxWalkDistance': max_walk_distance,
            'algorithm': self.algorithm
        }
        isochrone_response = requests.get(self.isochrone_url, params=payload)

        # Parse and traverse JSON from OTP so that we return only geometries
        json_poly = json.loads(isochrone_response.content)[0]['geometry']['geometries']
        polygons = [GEOSGeometry(json.dumps(poly)) for poly in json_poly]

        # Coerce to multipolygon
        isochrone_multipoly = MultiPolygon(polygons)
        return isochrone_multipoly

    def get(self, request, *args, **kwargs):
        """When a GET hits this endpoint, calculate an isochrone and find destinations within it"""
        params = request.GET

        iso = self.isochrone(
            lat=params.get('coords[lat]'),
            lng=params.get('coords[lng]'),
            mode=params.getlist('mode[]'),
            date=params.get('date'),
            time=params.get('time'),
            max_travel_time=params.get('maxTravelTime'),
            max_walk_distance=params.get('maxWalkDistance')
        )

        matched_objects = Destination.objects.filter(point__within=iso, published=True)
        return HttpResponse('{{"matched": "{0}"}}'.format(matched_objects), 'application/json')

class SearchDestinations(View):
    """ View for searching destinations via an http endpoint """

    def get(self, request, *args, **kwargs):
        """ GET destinations that match search queries

        Must pass either:
          - lat + lon params
          - text param
        Optional:
          - limit param

        A search via text will return destinations that match the destination name
        A search via lat/lon will return destinations that are closest to the search point

        """
        params = request.GET
        lat = params.get('lat', None)
        lon = params.get('lon', None)
        text = params.get('text', None)
        limit = params.get('limit', None)
        output_fields = ('name', 'description', 'point', 'address', 'city', 'state', 'zip')

        results = []
        if lat and lon:
            try:
                searchPoint = Point(float(lon), float(lat))
            except ValueError as e:
                error = json.dumps({
                    'msg': 'Invalid latitude/longitude pair',
                    'error': str(e),
                })
                return HttpResponse(error, 'application/json')
            results = (Destination.objects.filter(published=True)
                       .distance(searchPoint)
                       .order_by('distance'))
        elif text is not None:
            results = Destination.objects.filter(published=True, name__icontains=text)
        if limit:
            try:
                limit_int = int(limit)
            except ValueError as e:
                error = json.dumps({
                    'msg': 'Invalid limit, must be an integer',
                    'error': str(e),
                })
                return HttpResponse(error, 'application/json')
            results = results[:limit_int]
        data = serializers.serialize('json', results, fields=output_fields)
        return HttpResponse(data, 'application/json')