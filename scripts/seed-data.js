// Phase-3 dev data: Accra restaurants, menus and home-banner vouchers.
// Restaurant names are made up; coordinates are real neighbourhood points
// (0.5 to 15 km from East Legon). Prices are GHS.
//
// Every photo is from Unsplash under the Unsplash License
// (https://unsplash.com/license): free to use, no permission needed.
// Unsplash+ photos are not used. `source` is the photo page, which credits the photographer.

const LICENSE = 'Unsplash License';

const photo = (id, photographer, slug) => ({
  url: `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`,
  source: `https://unsplash.com/photos/${slug}`,
  photographer,
  license: LICENSE,
});

const IMAGES = {
  jollof: photo('1665332195309-9d75071138f0', "Keesha's Kitchen", 'PqG32DYCTM8'),
  riceAndBeans: photo('1705088293214-7494366cce01', 'Gourmet Lenz', 'K7HWtKAHDfc'),
  friedRice: photo('1603133872878-684f208fb84b', 'Christopher Alvarenga', 'rQX9eVpSFz8'),
  friedRiceBowl: photo('1512058564366-18510be2db19', 'Annie Spratt', 'oT7_v-I0hHg'),
  prawnRice: photo('1551326844-4df70f78d0e9', 'Mae Mu', 'dTNNDTbZr8I'),
  tilapia: photo('1718942899999-b3da4177ee2a', 'Michael Lock', 'hVnClpnYUUk'),
  fishLemon: photo('1665401015549-712c0dc5ef85', "Keesha's Kitchen", 'KRbF_wsztBE'),
  egusi: photo('1763048443535-1243379234e2', 'Tosan Dudun', '0A03YQqU4CU'),
  greenStew: photo('1604329760661-e71dc83f8f26', 'Femoree', 'kn_ANxnwCQ0'),
  stew: photo('1708782344137-21c48d98dfcc', 'Rimsha Noor', 'RVWHhDVjBNI'),
  soup: photo('1707274860789-12ba022ff3c1', 'Inna Safa', '8azrSXsMUis'),
  soupBowl: photo('1608500218861-01091cdc501e', 'Nathan Dumlao', '1lAIRAsv3C4'),
  plantain: photo('1788530757669-417558f26bef', 'Valdhy Mbemba', 'qoxK2LBKmIs'),
  plantainChips: photo('1762884601729-0eeeafbdfb8a', 'Jorge Campos', 'El7BbLDQ2SY'),
  skewers: photo('1705359573325-f2006d5e459f', 'Mihir Sabnis', 'FOZbF67e-DE'),
  skewersFries: photo('1603360946369-dc9bb6258143', 'Markus Winkler', 'WHtVB-RiW2I'),
  grillPlatter: photo('1555939594-58d7cb561ad1', 'Victoria Shes', 'UC0HZdUitWY'),
  wholeChicken: photo('1712579733874-c3a79f0f9d12', 'Sven Lippmann', 'hsoJOlqsBeU'),
  pizza: photo('1513104890138-7c749659a591', 'Ivan Torres', 'MQUqbmszGGM'),
  pizzaBoard: photo('1565299624946-b28f40a0ae38', 'Chad Montano', 'MqT0asuoIcU'),
  pepperoni: photo('1534308983496-4fabb1a015ee', 'Alan Hardman', 'SU1LFoeEUkk'),
  burger: photo('1568901346375-23c9450c58cd', 'amirali mirhashemian', 'sc5sTPMrVfk'),
  cheeseburger: photo('1572802419224-296b0aeee0d9', 'amirali mirhashemian', 'jh5XyK4Rr3Y'),
  burgerTray: photo('1550547660-d9450f859349', 'Mae Mu', 'I7A_pHLcQK8'),
  springRolls: photo('1515022376298-7333f33e704b', 'Joshua Hoehne', 'broMfoJ0Emg'),
  doughnuts: photo('1618411640018-972400a01458', 'Annie Spratt', 'EACvtuV2k2E'),
  glazed: photo('1573519939879-57c40b9cea5d', 'Jovan Vasiljević', 'fiKPM-x3oiQ'),
  iceCream: photo('1497034825429-c343d7c6a68f', 'ian dooley', 'TLD6iCOlyb0'),
  vanillaIceCream: photo('1560008581-09826d1de69e', 'sheri silver', '5A0O12BIsjY'),
  chocolateCake: photo('1517427294546-5aa121f68e8a', 'Will Echols', 'P_l1bJQpQF0'),
  sobolo: photo('1563636680-28d36aeb83a4', 'Gabi Miranda', 'd2l4XbFILG8'),
  orangeJuice: photo('1600271886742-f049cd451bba', 'Abhishek Hajare', 'kkrXVKK-jhg'),
  juices: photo('1603569283847-aa295f0d016a', 'Zlatko Đurić', 'U4QkDQW84sg'),
  smoothie: photo('1615478503562-ec2d8aa0e24e', 'Sara Julie', '9Gz5bMWdGYE'),
  spread: photo('1565895405227-31cffbe0cf86', 'Louis Hansel', 'cH5IPjaAYyo'),
  tableSpread: photo('1681219916726-036039b9b20d', 'Doğu Tuncer', 'KsVXWwHwhzo'),
};

// [name, category, price, image, rating, orderCount, description]
const RESTAURANTS = [
  {
    name: 'Auntie Esi Chop Bar', address: 'Lagos Avenue, East Legon', lat: 5.636, lng: -0.1650,
    deliveryTimeMins: 12, rating: 4.7, cover: 'egusi',
    description: 'Home-style soups and stews, pounded fresh every lunchtime.',
    menu: [
      ['Egusi Soup with Assorted Meat', 'soups-stews', 65, 'egusi', 4.8, 312, 'Melon seed soup with goat, tripe and wele.'],
      ['Palava Sauce with Boiled Yam', 'soups-stews', 50, 'greenStew', 4.6, 188, 'Kontomire and egusi stew with boiled yam.'],
      ['Light Soup with Goat', 'soups-stews', 55, 'soupBowl', 4.5, 146, 'Peppery tomato soup with goat meat.'],
      ['Groundnut Soup with Chicken', 'soups-stews', 60, 'soup', 4.7, 201, 'Peanut soup with free-range chicken.'],
      ['Jollof Rice with Fish', 'rice', 55, 'jollof', 4.4, 97, 'Smoky jollof with grilled fish and salad.'],
      ['Kelewele', 'snacks', 20, 'plantain', 4.6, 260, 'Spiced fried plantain cubes.'],
      ['Sobolo', 'drinks', 12, 'sobolo', 4.5, 175, 'Chilled hibiscus drink with ginger.'],
    ],
  },
  {
    name: 'Legon Jollof Hub', address: 'American House, East Legon', lat: 5.642, lng: -0.1530,
    deliveryTimeMins: 15, rating: 4.6, cover: 'jollof',
    description: 'Party jollof, fried rice and waakye made to order.',
    menu: [
      ['Party Jollof with Chicken', 'rice', 50, 'jollof', 4.8, 540, 'Firewood-smoked jollof with grilled chicken.'],
      ['Waakye Special', 'rice', 45, 'riceAndBeans', 4.7, 430, 'Rice and beans with egg, wele, gari and shito.'],
      ['Chicken Fried Rice', 'rice', 48, 'friedRice', 4.4, 265, 'Fried rice with peas, carrots and chicken.'],
      ['Assorted Fried Rice', 'rice', 58, 'friedRiceBowl', 4.5, 198, 'Fried rice with beef, sausage and chicken.'],
      ['Kelewele', 'snacks', 18, 'plantain', 4.5, 144, 'Spiced fried plantain cubes.'],
      ['Spring Rolls (4 pcs)', 'snacks', 25, 'springRolls', 4.2, 88, 'Vegetable spring rolls with chilli sauce.'],
      ['Fresh Orange Juice', 'drinks', 15, 'orangeJuice', 4.3, 120, 'Pressed Ghanaian oranges.'],
      ['Sobolo', 'drinks', 12, 'sobolo', 4.4, 160, 'Chilled hibiscus drink with ginger.'],
    ],
  },
  {
    name: 'Shiashie Grill House', address: 'Shiashie, off the Spintex Road', lat: 5.618, lng: -0.1590,
    deliveryTimeMins: 18, rating: 4.5, cover: 'grillPlatter',
    description: 'Charcoal grills, kebabs and tilapia by the roadside.',
    menu: [
      ['Grilled Tilapia with Banku', 'grills', 85, 'tilapia', 4.8, 356, 'Whole tilapia, banku, pepper and onions.'],
      ['Beef Kebab (5 sticks)', 'grills', 40, 'skewers', 4.5, 290, 'Suya-spiced beef skewers.'],
      ['Mixed Grill Platter', 'grills', 120, 'grillPlatter', 4.6, 132, 'Chicken, beef, sausage and grilled vegetables.'],
      ['Half Grilled Chicken', 'grills', 70, 'wholeChicken', 4.4, 175, 'Charcoal chicken with pepper sauce.'],
      ['Kebab and Chips', 'grills', 55, 'skewersFries', 4.3, 110, 'Two beef skewers with fries and salad.'],
      ['Plantain Chips', 'snacks', 10, 'plantainChips', 4.1, 95, 'Crisp salted plantain chips.'],
      ['Fruit Juice Trio', 'drinks', 25, 'juices', 4.2, 60, 'Pineapple, watermelon and orange.'],
    ],
  },
  {
    name: 'Madina Waakye Joint', address: 'Madina Market Road', lat: 5.669, lng: -0.1660,
    deliveryTimeMins: 20, rating: 4.4, cover: 'riceAndBeans',
    description: 'Morning waakye and evening jollof near the market.',
    menu: [
      ['Waakye with Everything', 'rice', 40, 'riceAndBeans', 4.7, 480, 'Waakye, egg, spaghetti, wele, fish and shito.'],
      ['Jollof with Fried Fish', 'rice', 42, 'jollof', 4.3, 210, 'Jollof rice with fried red fish.'],
      ['Plain Rice and Stew', 'rice', 30, 'stew', 4.1, 140, 'White rice with tomato beef stew.'],
      ['Kelewele', 'snacks', 15, 'plantain', 4.4, 190, 'Spiced fried plantain cubes.'],
      ['Sobolo', 'drinks', 10, 'sobolo', 4.3, 205, 'Chilled hibiscus drink with ginger.'],
      ['Bofrot (6 pcs)', 'desserts', 12, 'doughnuts', 4.2, 150, 'Ghanaian puff-puff doughnuts.'],
    ],
  },
  {
    name: 'Airport City Pizzeria', address: 'Airport Residential Area', lat: 5.604, lng: -0.1730,
    deliveryTimeMins: 25, rating: 4.5, cover: 'pizza',
    description: 'Wood-fired pizza with local toppings.',
    menu: [
      ['Margherita Pizza', 'pizza-burgers', 95, 'pizza', 4.6, 260, 'Tomato, mozzarella and basil.'],
      ['Pepperoni Pizza', 'pizza-burgers', 110, 'pepperoni', 4.7, 320, 'Beef pepperoni and mozzarella.'],
      ['Suya Chicken Pizza', 'pizza-burgers', 120, 'pizzaBoard', 4.5, 180, 'Suya-spiced chicken, onions and peppers.'],
      ['Garlic Spring Rolls', 'snacks', 30, 'springRolls', 4.0, 70, 'Fried spring rolls with garlic dip.'],
      ['Vanilla Ice Cream', 'desserts', 25, 'vanillaIceCream', 4.3, 90, 'Two scoops with sprinkles.'],
      ['Chocolate Cake Slice', 'desserts', 35, 'chocolateCake', 4.4, 85, 'Rich chocolate sponge.'],
      ['Berry Smoothie', 'drinks', 30, 'smoothie', 4.2, 65, 'Strawberry, banana and blackberry.'],
    ],
  },
  {
    name: 'Adenta Burger Shack', address: 'Adenta Barrier', lat: 5.708, lng: -0.1590,
    deliveryTimeMins: 22, rating: 4.3, cover: 'cheeseburger',
    description: 'Smash burgers, fries and shakes.',
    menu: [
      ['Classic Beef Burger', 'pizza-burgers', 55, 'burger', 4.4, 290, 'Beef patty, lettuce, tomato and house sauce.'],
      ['Double Cheeseburger', 'pizza-burgers', 75, 'cheeseburger', 4.6, 350, 'Two patties with cheddar.'],
      ['Chicken Burger', 'pizza-burgers', 55, 'burgerTray', 4.3, 170, 'Crispy chicken thigh with slaw.'],
      ['Spring Rolls (4 pcs)', 'snacks', 22, 'springRolls', 4.0, 60, 'Vegetable spring rolls.'],
      ['Strawberry Ice Cream Cone', 'desserts', 18, 'iceCream', 4.2, 120, 'Soft-serve strawberry cone.'],
      ['Glazed Doughnuts (3 pcs)', 'desserts', 20, 'glazed', 4.1, 80, 'Fresh glazed doughnuts.'],
      ['Fresh Orange Juice', 'drinks', 15, 'orangeJuice', 4.2, 75, 'Pressed Ghanaian oranges.'],
    ],
  },
  {
    name: 'Osu Night Market Kitchen', address: 'Oxford Street, Osu', lat: 5.556, lng: -0.1800,
    deliveryTimeMins: 35, rating: 4.6, cover: 'skewers',
    description: 'Late-night grills and street snacks from Oxford Street.',
    menu: [
      ['Suya Beef Skewers', 'grills', 45, 'skewers', 4.7, 410, 'Spicy suya beef with onions.'],
      ['Grilled Tilapia', 'grills', 90, 'fishLemon', 4.6, 230, 'Whole tilapia with lemon and pepper.'],
      ['Kebab and Chips', 'grills', 55, 'skewersFries', 4.3, 140, 'Beef skewers with fries.'],
      ['Jollof Rice with Chicken', 'rice', 55, 'jollof', 4.4, 260, 'Smoky jollof with fried chicken.'],
      ['Kelewele and Groundnuts', 'snacks', 22, 'plantain', 4.6, 300, 'Spiced plantain with roasted peanuts.'],
      ['Bofrot (6 pcs)', 'desserts', 12, 'doughnuts', 4.3, 110, 'Ghanaian puff-puff doughnuts.'],
      ['Sobolo', 'drinks', 12, 'sobolo', 4.5, 240, 'Chilled hibiscus drink with ginger.'],
      ['Fruit Juice Trio', 'drinks', 28, 'juices', 4.1, 55, 'Pineapple, watermelon and orange.'],
    ],
  },
  {
    name: 'Labone Sweet Tooth', address: 'Labone Crescent', lat: 5.566, lng: -0.1680,
    deliveryTimeMins: 30, rating: 4.4, cover: 'chocolateCake',
    description: 'Cakes, ice cream and cold drinks.',
    menu: [
      ['Chocolate Fudge Cake', 'desserts', 40, 'chocolateCake', 4.7, 210, 'Chocolate sponge with fudge icing.'],
      ['Strawberry Ice Cream', 'desserts', 25, 'iceCream', 4.5, 190, 'Two scoops on a cone.'],
      ['Vanilla Sundae', 'desserts', 30, 'vanillaIceCream', 4.3, 120, 'Vanilla with sprinkles and syrup.'],
      ['Glazed Doughnuts (3 pcs)', 'desserts', 22, 'glazed', 4.2, 140, 'Fresh glazed doughnuts.'],
      ['Bofrot (6 pcs)', 'desserts', 12, 'doughnuts', 4.4, 170, 'Ghanaian puff-puff doughnuts.'],
      ['Berry Smoothie', 'drinks', 32, 'smoothie', 4.4, 130, 'Strawberry, banana and blackberry.'],
      ['Fresh Orange Juice', 'drinks', 15, 'orangeJuice', 4.2, 90, 'Pressed Ghanaian oranges.'],
    ],
  },
  {
    name: 'Spintex Rice & Stew', address: 'Coca-Cola Roundabout, Spintex Road', lat: 5.633, lng: -0.1100,
    deliveryTimeMins: 25, rating: 4.2, cover: 'stew',
    description: 'Office-lunch rice plates and stews.',
    menu: [
      ['Rice and Beef Stew', 'rice', 38, 'stew', 4.2, 220, 'White rice with tomato beef stew.'],
      ['Prawn Fried Rice', 'rice', 70, 'prawnRice', 4.5, 130, 'Fried rice with prawns and vegetables.'],
      ['Chicken Fried Rice', 'rice', 45, 'friedRice', 4.3, 190, 'Fried rice with peas, carrots and chicken.'],
      ['Palava Sauce with Rice', 'soups-stews', 45, 'greenStew', 4.4, 115, 'Kontomire stew with white rice.'],
      ['Groundnut Soup with Rice Balls', 'soups-stews', 55, 'soup', 4.5, 140, 'Omo tuo with peanut soup.'],
      ['Plantain Chips', 'snacks', 10, 'plantainChips', 4.0, 70, 'Crisp salted plantain chips.'],
    ],
  },
  {
    name: 'Dzorwulu Fish Spot', address: 'Dzorwulu, near the Fiesta Royale', lat: 5.613, lng: -0.2000,
    deliveryTimeMins: 28, rating: 4.5, cover: 'tilapia',
    description: 'Tilapia, banku and fresh seafood rice.',
    menu: [
      ['Grilled Tilapia with Banku', 'grills', 90, 'tilapia', 4.8, 380, 'Whole tilapia, banku and shito.'],
      ['Lemon Pepper Tilapia', 'grills', 95, 'fishLemon', 4.5, 150, 'Tilapia with lemon and pepper.'],
      ['Prawn Fried Rice', 'rice', 75, 'prawnRice', 4.4, 120, 'Fried rice with prawns.'],
      ['Light Soup with Fish', 'soups-stews', 60, 'soupBowl', 4.3, 100, 'Pepper soup with fresh fish.'],
      ['Kelewele', 'snacks', 18, 'plantain', 4.4, 130, 'Spiced fried plantain cubes.'],
      ['Sobolo', 'drinks', 12, 'sobolo', 4.3, 110, 'Chilled hibiscus drink with ginger.'],
    ],
  },
  {
    name: 'Kaneshie Family Kitchen', address: 'Kaneshie Market Complex', lat: 5.567, lng: -0.2380,
    deliveryTimeMins: 40, rating: 4.3, cover: 'spread',
    description: 'Big family plates, soups and rice.',
    menu: [
      ['Family Jollof Tray', 'rice', 150, 'jollof', 4.5, 90, 'Jollof, chicken, salad and plantain for four.'],
      ['Waakye Plate', 'rice', 38, 'riceAndBeans', 4.4, 230, 'Waakye with egg, wele and shito.'],
      ['Egusi Soup with Fufu', 'soups-stews', 60, 'egusi', 4.5, 160, 'Melon seed soup with assorted meat.'],
      ['Beef Stew with Yam', 'soups-stews', 45, 'stew', 4.1, 95, 'Tomato beef stew with boiled yam.'],
      ['Grilled Chicken', 'grills', 60, 'wholeChicken', 4.2, 105, 'Charcoal chicken quarter.'],
      ['Spring Rolls (4 pcs)', 'snacks', 20, 'springRolls', 4.0, 50, 'Vegetable spring rolls.'],
      ['Bofrot (6 pcs)', 'desserts', 10, 'doughnuts', 4.3, 140, 'Ghanaian puff-puff doughnuts.'],
      ['Sobolo', 'drinks', 10, 'sobolo', 4.4, 150, 'Chilled hibiscus drink with ginger.'],
    ],
  },
  {
    name: 'Cantonments Bistro', address: 'Cantonments Road', lat: 5.579, lng: -0.1700,
    deliveryTimeMins: 30, rating: 4.6, cover: 'tableSpread',
    description: 'Modern Ghanaian plates and pizza.',
    menu: [
      ['Jollof Risotto with Prawns', 'rice', 110, 'prawnRice', 4.6, 95, 'Creamy jollof with grilled prawns.'],
      ['Mixed Grill Platter', 'grills', 140, 'grillPlatter', 4.7, 120, 'Chicken, beef and lamb with vegetables.'],
      ['Margherita Pizza', 'pizza-burgers', 100, 'pizza', 4.5, 140, 'Tomato, mozzarella and basil.'],
      ['Gourmet Beef Burger', 'pizza-burgers', 85, 'burgerTray', 4.5, 130, 'Aged beef, cheddar and caramelised onions.'],
      ['Groundnut Soup Bowl', 'soups-stews', 70, 'soup', 4.4, 70, 'Peanut soup with chicken and rice balls.'],
      ['Chocolate Cake Slice', 'desserts', 40, 'chocolateCake', 4.6, 100, 'Rich chocolate sponge.'],
      ['Berry Smoothie', 'drinks', 35, 'smoothie', 4.3, 60, 'Strawberry, banana and blackberry.'],
      ['Fruit Juice Trio', 'drinks', 30, 'juices', 4.2, 50, 'Pineapple, watermelon and orange.'],
    ],
  },
];

const VOUCHERS = [
  {
    title: 'Jollof Friday',
    description: 'GHS 20 off any order this week',
    discountAmount: 20,
    image: 'jollof',
    daysValid: 30,
  },
  {
    title: 'Weekend treat',
    description: 'GHS 15 off your weekend order',
    discountAmount: 15,
    image: 'grillPlatter',
    daysValid: 14,
  },
];

module.exports = { IMAGES, RESTAURANTS, VOUCHERS };
