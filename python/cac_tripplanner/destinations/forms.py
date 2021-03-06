from django.forms import ModelForm, ValidationError

from cac_tripplanner.image_utils import validate_image

from .models import Destination, Event, NARROW_IMAGE_DIMENSIONS, WIDE_IMAGE_DIMENSIONS


class ExtraImagesForm(ModelForm):
    def clean_image_raw(self):
        """Custom validator for image field"""
        return validate_image(self.cleaned_data.get('image_raw', False), WIDE_IMAGE_DIMENSIONS)


class DestinationForm(ModelForm):

    class Meta:
        model = Destination
        exclude = []

    def clean_image_raw(self):
        """Custom validator for image field"""
        return validate_image(self.cleaned_data.get('image_raw', False), NARROW_IMAGE_DIMENSIONS)

    def clean_wide_image_raw(self):
        """Custom validator for wide_image field"""
        return validate_image(self.cleaned_data.get('wide_image_raw', False), WIDE_IMAGE_DIMENSIONS)


class EventForm(DestinationForm):
    """Subclass DestinationForm for image validation."""

    class Meta:
        model = Event
        exclude = []

    def __init__(self, *args, **kwargs):
        super(EventForm, self).__init__(*args, **kwargs)
        self.fields['destination'].widget.can_delete_related = False
        self.fields['destination'].widget.can_add_related = False
        self.fields['destination'].widget.can_change_related = False

    def clean(self):
        """Validate start date is less than end date"""
        cleaned_data = super(EventForm, self).clean()
        start = self.cleaned_data.get('start_date')
        end = self.cleaned_data.get('end_date')

        if start and end and start >= end:
            self.add_error('start_date', ValidationError('Start date must be before end date.'))

        return cleaned_data
