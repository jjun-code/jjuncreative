import { config, fields, collection, singleton } from '@keystatic/core';

// Local files while developing; Keystatic Cloud (saves to your GitHub repo) once live.
// Set PUBLIC_KEYSTATIC_PROJECT (e.g. "your-team/jjuncreative") in Cloudflare's environment variables.
const project = import.meta.env.PUBLIC_KEYSTATIC_PROJECT || 'your-team/jjuncreative';

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
      Work: ['work'],
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
          description: 'Its images join the rotating ring on the home page.',
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
          { label: 'Project colour', description: 'The colour tints the top of the project page. Shape and keyring are no longer shown on the site.' }
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
  },

  singletons: {
    home: singleton({
      label: 'Home page',
      path: 'src/content/home',
      schema: {
        heroWords: fields.array(fields.text({ label: 'Word' }), {
          label: 'Hero words',
          description: 'Cycles after "Design led by" in the home page headline.',
          itemLabel: (p) => p.value,
        }),
        doesWords: fields.array(fields.text({ label: 'Word' }), {
          label: '"junjie does" words',
          description: 'Each word becomes a card in the home page skills grid.',
          itemLabel: (p) => p.value,
        }),
        aboutBlurb: fields.text({ label: 'About blurb', multiline: true }),
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
