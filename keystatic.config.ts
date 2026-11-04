import { config, fields, collection, singleton } from '@keystatic/core';

// Local files while developing; Keystatic Cloud (saves to the GitHub repo) once live.
// The Keystatic Cloud project (team/project); not a secret, so it lives here
// rather than in a build variable.
const project = 'jjuncreative/jjuncreative';

const imageWithFallback = (label: string, directory: string, publicPath: string) => ({
  image: fields.image({ label, directory, publicPath }),
  imageUrl: fields.url({
    label: `${label} (old Framer link)`,
    description: 'Carried over from the Framer site. Upload an image above to replace it before you cancel Framer.',
  }),
});

export default config({
  storage: import.meta.env.PROD ? { kind: 'cloud' } : { kind: 'local' },
  cloud: { project },
  ui: {
    brand: { name: 'jjuncreative' },
    navigation: {
      Work: ['work', 'journal'],
      Pages: ['home', 'about', 'site'],
    },
  },

  collections: {
    work: collection({
      label: 'Projects',
      slugField: 'title',
      path: 'src/content/work/*',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'year', 'category'],
      schema: {
        title: fields.slug({ name: { label: 'Project name' } }),
        hidden: fields.checkbox({
          label: 'Hidden',
          description: 'Takes it off the site (and out of search) without deleting it. Untick to bring it back.',
          defaultValue: false,
        }),
        year: fields.integer({ label: 'Year', validation: { isRequired: true } }),
        category: fields.text({ label: 'Category', description: 'e.g. Product, Branding and Identity' }),
        tools: fields.array(fields.text({ label: 'Tool' }), {
          label: 'Tools',
          itemLabel: (p) => p.value,
        }),
        summary: fields.text({ label: 'One-line summary', multiline: true }),
        order: fields.integer({
          label: 'Sort order',
          description: 'Lower numbers show first. Leave blank to sort by year.',
        }),
        featured: fields.checkbox({
          label: 'Feature on home page',
          description: 'Not used in the current design: every project appears as a tile on the home page, in Sort order.',
          defaultValue: false,
        }),

        charm: fields.object(
          {
            color: fields.text({ label: 'Colour', description: 'Hex value, e.g. #610AC7', defaultValue: '#2F3CFF' }),
            shape: fields.select({
              label: 'Charm shape',
              options: [
                { label: 'Diamond', value: 'diamond' },
                { label: 'Coin', value: 'coin' },
                { label: 'Tag', value: 'tag' },
                { label: 'Capsule', value: 'capsule' },
                { label: 'Hex nut', value: 'hex' },
              ],
              defaultValue: 'coin',
            }),
            onKeyring: fields.checkbox({ label: 'Hang on the home page keyring', defaultValue: true }),
          },
          { label: 'Project colour', description: 'Shows behind its card and thumbnail while the image loads. Shape and keyring are no longer shown on the site.' }
        ),

        cover: fields.object(imageWithFallback('Cover image', 'public/images/work', '/images/work/'), {
          label: 'Cover',
        }),

        problem: fields.text({ label: 'Problem', multiline: true }),
        solution: fields.text({ label: 'Solution', multiline: true }),
        intro: fields.text({ label: 'Intro statement', description: 'The large paragraph after problem and solution.', multiline: true }),

        inlineImage: fields.object(imageWithFallback('Feature image', 'public/images/work', '/images/work/'), {
          label: 'Feature image',
          description: 'Sits between the intro and the story.',
        }),

        gallery: fields.array(
          fields.object({
            ...imageWithFallback('Image', 'public/images/work', '/images/work/'),
            caption: fields.text({ label: 'Caption' }),
          }),
          {
            label: 'Gallery',
            itemLabel: (p) => p.fields.caption.value || 'Image',
          }
        ),

        body: fields.markdoc({
          label: 'Story',
          options: {
            image: { directory: 'public/images/work', publicPath: '/images/work/' },
          },
        }),
      },
    }),

    // Visual journal: a collection of cool things (images, GIFs, video, links),
    // shown on the home page as a field to drag around; clicking one opens it
    // full screen
    journal: collection({
      label: 'Visual journal',
      slugField: 'title',
      path: 'src/content/journal/*',
      format: 'yaml',
      columns: ['title', 'kind', 'year'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        hidden: fields.checkbox({
          label: 'Hidden',
          description: 'Takes it off the site (and out of search) without deleting it. Untick to bring it back.',
          defaultValue: false,
        }),
        kind: fields.select({
          label: 'Type',
          options: [
            { label: 'Photography', value: 'photo' },
            { label: 'Image or GIF', value: 'image' },
            { label: 'Video', value: 'video' },
            { label: 'Link', value: 'link' },
          ],
          defaultValue: 'image',
        }),
        image: fields.image({
          label: 'Image',
          description: 'The image or GIF itself; for a video or link, the still shown in the grid. Leave empty for a Photography album: its photos all go under Photos below. About 2000px on the long edge.',
          directory: 'public/images/journal',
          publicPath: '/images/journal/',
        }),
        video: fields.file({
          label: 'Video file',
          description: 'An MP4 or WebM; if there is one, the entry plays it whatever its Type. Keep it under 20 MB (Cloudflare serves files up to 25 MB). For longer clips, use a YouTube or Vimeo link instead.',
          directory: 'public/media/journal',
          publicPath: '/media/journal/',
        }),
        link: fields.url({
          label: 'Link',
          description: 'For Link: the page it points to. A YouTube or Vimeo link plays in the viewer; anything else gets a Visit button.',
        }),
        more: fields.array(
          fields.object({
            image: fields.image({
              label: 'Image',
              directory: 'public/images/journal',
              publicPath: '/images/journal/',
              validation: { isRequired: true },
            }),
            caption: fields.text({ label: 'Caption' }),
          }),
          {
            label: 'Photos',
            description: 'A Photography album: every photo, in order (drag to rearrange). A random one is the cover on each visit, and the viewer starts there. For other types, extra images shown after the main one.',
            itemLabel: (p) => p.fields.caption.value || 'Photo',
          }
        ),
        source: fields.text({ label: 'Source', description: 'Who made it or where you found it, e.g. a studio, artist or site' }),
        year: fields.integer({ label: 'Year' }),
        description: fields.text({ label: 'Note', multiline: true }),
        color: fields.text({ label: 'Colour', description: 'Hex value, shown while the image loads', defaultValue: '#2a2a2a' }),
        order: fields.integer({ label: 'Sort order', description: 'Lower numbers show first. Leave blank to sort by year.' }),
      },
    }),
  },

  singletons: {
    home: singleton({
      label: 'Home page (not shown)',
      path: 'src/content/home',
      schema: {
        heroWords: fields.array(fields.text({ label: 'Word' }), {
          label: 'Hero words',
          description: 'Not shown in the current design.',
          itemLabel: (p) => p.value,
        }),
        doesWords: fields.array(fields.text({ label: 'Word' }), {
          label: '"junjie does" words',
          description: 'Not shown in the current design.',
          itemLabel: (p) => p.value,
        }),
        aboutBlurb: fields.text({ label: 'About blurb', description: 'Not shown in the current design.', multiline: true }),
        marquee: fields.text({ label: 'Marquee text', description: 'Not shown in the current design.' }),
      },
    }),

    about: singleton({
      label: 'About page',
      path: 'src/content/about',
      schema: {
        headline: fields.text({ label: 'Headline', multiline: true }),
        hello: fields.text({ label: 'Hello paragraph', multiline: true }),
        portrait: fields.object(imageWithFallback('Portrait', 'public/images/about', '/images/about/'), {
          label: 'Portrait',
        }),
        interests: fields.array(fields.text({ label: 'Interest' }), {
          label: 'Interests',
          itemLabel: (p) => p.value,
        }),
        stats: fields.array(
          fields.object({ label: fields.text({ label: 'Label' }), value: fields.text({ label: 'Value' }) }),
          { label: 'Quick facts', itemLabel: (p) => `${p.fields.label.value}: ${p.fields.value.value}` }
        ),
        experience: fields.array(
          fields.object({
            years: fields.text({ label: 'Years', description: 'e.g. 2022 — now' }),
            company: fields.text({ label: 'Company' }),
            role: fields.text({ label: 'Role' }),
            note: fields.text({ label: 'Note' }),
          }),
          { label: 'Experience', itemLabel: (p) => `${p.fields.company.value} (${p.fields.years.value})` }
        ),
        toolkit: fields.array(
          fields.object({ name: fields.text({ label: 'Tool' }), use: fields.text({ label: 'Used for' }) }),
          { label: 'Toolkit', itemLabel: (p) => p.fields.name.value }
        ),
      },
    }),

    site: singleton({
      label: 'Contact & site details',
      path: 'src/content/site',
      schema: {
        role: fields.text({ label: 'Role line' }),
        location: fields.text({ label: 'Location' }),
        coordinates: fields.text({ label: 'Coordinates' }),
        availability: fields.text({ label: 'Availability line', multiline: true }),
        email: fields.text({ label: 'Email' }),
        socials: fields.array(
          fields.object({ label: fields.text({ label: 'Label' }), url: fields.url({ label: 'Link' }) }),
          { label: 'Social links', itemLabel: (p) => p.fields.label.value }
        ),
        description: fields.text({ label: 'Search & share description', multiline: true }),
      },
    }),
  },
});
