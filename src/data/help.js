// Help centre content for GET /help. Kept in code until staff need to edit it.

const faqs = [
  ['general', 'What is YumQuick?', 'YumQuick brings meals from restaurants near you to your door. Browse dishes, add them to your cart, pay and follow your rider on the map.'],
  ['general', 'Where do you deliver?', 'Home shows the restaurants that deliver to your address. If none appear, we do not deliver there yet.'],
  ['general', 'How long does delivery take?', 'Each order shows an estimate before you pay: the restaurant\'s cooking time plus the ride to you. You can follow the rider live once the order is on its way.'],
  ['general', 'How much is delivery?', 'The delivery charge is shown in your cart before you pay. A voucher can lower your total.'],
  ['general', 'How do I use a voucher?', 'Pick a voucher at checkout. The discount comes off your total before you pay.'],
  ['account', 'How do I create an account?', 'Sign up with your name, email and phone number, then enter the code we send to your phone.'],
  ['account', 'I forgot my password. What do I do?', 'Tap Forgot password on the login screen. We send you a code, and after entering it you choose a new password.'],
  ['account', 'How do I change my name, phone or photo?', 'Open your profile and edit the details. A new photo replaces the old one.'],
  ['account', 'How do I save a delivery address?', 'Add addresses in your profile, or at checkout. You can pick any saved address for an order.'],
  ['account', 'Is my card safe?', 'We keep only the card brand and its last four digits, never the full number or the CVV.'],
  ['services', 'How can I pay?', 'Mobile money (MTN MoMo, Telecel Cash or AirtelTigo Money), a Visa or Mastercard card, or cash on delivery.'],
  ['services', 'Can I cancel an order?', 'Yes, while the restaurant has not started on it. Open the order in My Orders and tap Cancel.'],
  ['services', 'How do I track my order?', 'Open the order in My Orders and tap Track order. The map shows your rider and the arrival time.'],
  ['services', 'Can I contact my rider?', 'Once your order is on its way, you can call or message the rider from the tracking screen.'],
  ['services', 'How do I rate my order?', 'After delivery, open the order in My Orders and leave a rating for the dishes and the restaurant.'],
].map(([category, question, answer], i) => ({ _id: `faq-${i + 1}`, category, question, answer }));

// PLACEHOLDERS: replace with the real support contacts before launch.
const contact = {
  phone: '+233000000000',
  email: 'support@example.com',
  website: 'https://example.com',
  whatsapp: '+233000000000',
  facebook: 'https://facebook.com/example',
  instagram: 'https://instagram.com/example',
};

module.exports = { faqs, contact };
