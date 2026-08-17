import { DOCUMENT } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-membership',
  imports: [RouterLink],
  templateUrl: './membership.html',
  styleUrl: './membership.css',
})
export class MembershipComponent implements OnInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);

  readonly features = [
    {
      icon: 'auto_awesome',
      title: 'AI Wiki Wizard',
      copy: 'Build a rich, interactive board in under 5 minutes with our AI co-pilot.',
    },
    {
      icon: 'location_on',
      title: 'Maps & Off-Grid',
      copy: 'Tag places using what3words and find spots most people miss.',
    },
    {
      icon: 'music_video',
      title: 'Media & Music',
      copy: 'Embed YouTube clips, songs, photos & more to bring boards to life.',
    },
    {
      icon: 'map',
      title: 'Itineraries & Tours',
      copy: 'Create walking tours, road trips & day plans that are easy to share.',
    },
    {
      icon: 'share',
      title: 'Share Anywhere',
      copy: 'Export as beautiful cards or MP4 videos for social media in one click.',
    },
    {
      icon: 'groups',
      title: 'Connect & Collaborate',
      copy: 'Invite friends, plan events, and build boards together.',
    },
  ];

  readonly stats = [
    { icon: 'public', value: '200+', label: 'Global Cities' },
    { icon: 'school', value: '500+', label: 'Colleges & Universities' },
    { icon: 'dashboard', value: '10,000+', label: 'Wiki Boards Created' },
    { icon: 'collections', value: '150,000+', label: 'Cards Generated' },
    { icon: 'smart_display', value: '25,000+', label: 'Social Videos Shared' },
  ];

  readonly launchPerks = [
    'Early access to new tools',
    'Founding-member pricing',
    'Higher AI-generation limits',
    'Exclusive templates',
    'Reserve your public username',
    'Featured-member opportunities',
  ];

  ngOnInit(): void {
    const origin = this.document.location?.origin;
    const image = origin && origin !== 'null' ? `${origin}/og-membership.png` : '/og-membership.png';
    const description =
      'Turn cities, campuses, journeys, and curiosities into interactive worlds of places, stories, media, and unexpected discoveries.';

    this.meta.addTags([
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Don’t Just Search. Let’s Go. | LivingWiki' },
      { property: 'og:description', content: description },
      { property: 'og:image', content: image },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Don’t Just Search. Let’s Go. | LivingWiki' },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ]);
  }

  ngOnDestroy(): void {
    for (const selector of [
      "name='description'",
      "property='og:type'",
      "property='og:title'",
      "property='og:description'",
      "property='og:image'",
      "name='twitter:card'",
      "name='twitter:title'",
      "name='twitter:description'",
      "name='twitter:image'",
    ]) {
      this.meta.removeTag(selector);
    }
  }
}
