# -*- coding: utf-8 -*-
# Generated by Django 1.11.7 on 2017-12-01 19:39
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('destinations', '0026_auto_20171201_1427'),
    ]

    operations = [
        migrations.CreateModel(
            name='Activity',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=50, unique=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='destination',
            name='activities',
            field=models.ManyToManyField(to='destinations.Activity'),
        ),
        migrations.AddField(
            model_name='event',
            name='activities',
            field=models.ManyToManyField(to='destinations.Activity'),
        ),
    ]
