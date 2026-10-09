import { defineTool } from './define';

export const businessTools = [
  defineTool({
    id: 'invoice-generator',
    name: 'GST Invoice Generator',
    description: 'Create a professional GST invoice and download it as a PDF — with CGST/SGST or IGST, HSN codes, discounts, totals and amount in words.',
    category: 'business',
    icon: 'Receipt',
    status: 'available',
    outputTypes: ['application/pdf'],
    intents: ['create'],
    keywords: ['invoice generator', 'gst invoice', 'tax invoice', 'bill generator', 'invoice maker', 'create invoice', 'invoice pdf', 'cgst sgst igst'],
    aliases: ['gst invoice generator', 'free invoice generator', 'tax invoice maker', 'bill maker'],
    actionLabel: 'Create invoice',
    limitations: [
      'The rupee sign is written as “Rs.” because standard PDF fonts cannot embed ₹.',
      'GST rates and HSN codes are yours to enter — confirm the correct rate for your goods or services.',
      'Your saved seller details are kept only in this browser.',
    ],
    related: ['gst-calculator', 'business-calculator', 'pdf-compressor'],
    popular: true,
  }),
  defineTool({
    id: 'business-calculator',
    name: 'Business Calculator',
    description: 'Profit margin and markup, break-even point, and discount/MRP calculations with the formulas shown.',
    category: 'business',
    icon: 'TrendingUp',
    status: 'available',
    intents: ['analyze'],
    keywords: ['margin calculator', 'markup calculator', 'profit margin', 'break even calculator', 'break-even point', 'discount calculator', 'selling price'],
    aliases: ['profit margin calculator', 'markup calculator', 'break even calculator'],
    related: ['invoice-generator', 'gst-calculator', 'percentage-calculator'],
  }),
];
