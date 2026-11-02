// The support chat's bot: a numbered menu with short answers. Every answer offers
// a way to a person or back to the menu. Values are what the app sends as `option`.

const MENU = [
  { label: 'Order management', value: '1' },
  { label: 'Payments', value: '2' },
  { label: 'Account and profile', value: '3' },
  { label: 'Order tracking', value: '4' },
  { label: 'Safety', value: '5' },
];
const TALK = { label: 'Talk to a person', value: 'talk_to_person' };
const BACK = { label: 'Main menu', value: 'menu' };
const ORDER_OPTIONS = [
  { label: 'Order issues', value: 'order_issues' },
  { label: 'Order not received', value: 'order_not_received' },
];

const ANSWERS = {
  order_issues: 'Sorry about that. While the restaurant has not started on your order, you can cancel it under My Orders. '
    + 'If something is missing or wrong after it arrives, tell a person here and we will put it right.',
  order_not_received: 'Open the order in My Orders and tap Track order: the map shows where your rider is and when they should arrive. '
    + 'If that time has passed and nothing has come, a person will sort it out.',
  2: 'You can pay with mobile money (MTN MoMo, Telecel Cash or AirtelTigo Money), a Visa or Mastercard card, or cash on delivery. '
    + 'If you cancel before the restaurant starts, a card or MoMo payment is refunded.',
  3: 'You can change your name, phone number, photo and saved addresses in your profile. '
    + 'Forgot your password? Tap Forgot password on the login screen and we will send you a code.',
  4: 'Once a rider picks up your order, open it in My Orders and tap Track order to see them on the map and the arrival time. '
    + 'From there you can also call or message your rider.',
  5: 'You can ask your rider to leave the order at your door or gate when they call or message you. '
    + 'Never share your MoMo PIN, card PIN or login code with anyone, including riders and our staff. '
    + 'To report a rider, tap Talk to a person and tell us what happened.',
};

// All values the app may send as `option`.
const OPTION_LABELS = Object.fromEntries(
  [...MENU, ...ORDER_OPTIONS, TALK, BACK].map((o) => [o.value, o.label])
);

const menu = (text) => ({ text, options: MENU });

// First messages of a new support thread.
const greeting = (name) => [
  menu(`Hi${name ? ` ${name.split(' ')[0]}` : ''}! I'm the YumQuick assistant. What can I help you with? Tap an option or type its number.`),
];

// The bot's answer to an option value. activeOrder is the order card for option
// "1" (null when the user has none). Returns { messages, status? }.
function answer(value, activeOrder) {
  if (value === '1') {
    if (!activeOrder)
      return { messages: [{ text: 'You have no active orders right now. Past orders are under My Orders.', options: [TALK, BACK] }] };
    return { messages: [{ text: 'This is your latest active order. What is the problem?', order: activeOrder, options: [...ORDER_OPTIONS, BACK] }] };
  }
  if (value === 'talk_to_person')
    return { messages: [{ text: 'A member of our team will reply here soon.' }], status: 'waiting_staff' };
  if (value === 'menu') return { messages: [menu('What else can I help you with?')] };
  if (ANSWERS[value]) return { messages: [{ text: ANSWERS[value], options: [TALK, BACK] }] };
  return { messages: [menu("Sorry, I didn't catch that. Tap an option or type its number.")] };
}

module.exports = { OPTION_LABELS, greeting, answer };
