# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('CMS', '0002_auto_20150122_0936'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='article',
            name='published',
        ),
    ]
