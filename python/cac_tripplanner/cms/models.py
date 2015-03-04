from django.db import models
from django.contrib.auth.models import User
from django.utils.timezone import now

from ckeditor.fields import RichTextField


class ArticleManager(models.Manager):

    def published(self):
        return self.get_queryset().filter(publish_date__lt=now())

    def random(self):
        """Returns a randomized title and slug field if one is available

        Note: This does not return a queryset so cannot be chained,
        if additional filtering is required, use a different method
        """
        randomized = self.published().values('title', 'slug').order_by('?')[:1]
        if randomized:
            return randomized[0]
        else:
            None


class CommunityProfileManager(ArticleManager):
    """Custom manager to get only community profiles"""

    def get_queryset(self):
        return super(CommunityProfileManager, self).get_queryset().filter(content_type='prof')


class TipsAndTricksManager(ArticleManager):
    """Custom manager to get only tips and tricks"""

    def get_queryset(self):
        return super(TipsAndTricksManager, self).get_queryset().filter(content_type='tips')


class Article(models.Model):

    class ArticleTypes(object):
        community_profile = 'prof'
        tips_and_tricks = 'tips'

        CHOICES = (
            (community_profile, 'Community Profile'),
            (tips_and_tricks, 'Tips and Tricks'),
        )

    title = models.CharField(max_length=80)
    slug = models.SlugField()
    author = models.ForeignKey(User)
    teaser = RichTextField()  # above the fold
    content = RichTextField(null=True, blank=True)  # below the fold
    publish_date = models.DateTimeField(blank=True, null=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    content_type = models.CharField(max_length=4, choices=ArticleTypes.CHOICES)

    @property
    def published(self):
        """Helper property to easily determine if an article is published"""
        if self.publish_date:
            return (self.publish_date < now())
        else:
            return False

    # Managers
    objects = ArticleManager()
    profiles = CommunityProfileManager()
    tips = TipsAndTricksManager()

    def __unicode__(self):
        return self.title