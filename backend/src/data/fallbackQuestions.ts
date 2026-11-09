export interface FallbackAnswer {
  text: string;
  points: number;
}

export interface FallbackQuestion {
  questionText: string;
  answers: FallbackAnswer[];
}

export interface FallbackLanguageSet {
  fastMoneySets: FallbackQuestion[][];
  mainGameQuestions: FallbackQuestion[];
}

export const FALLBACK_QUESTION_BANK: Record<'EN' | 'FR' | 'ES', FallbackLanguageSet> = {
  EN: {
    fastMoneySets: [
      [
        {
          questionText: 'Name a month where people spend the most money',
          answers: [
            { text: 'December', points: 55 },
            { text: 'November', points: 22 },
            { text: 'July', points: 12 },
            { text: 'August', points: 7 },
            { text: 'January', points: 4 },
          ],
        },
        {
          questionText: 'Name an animal you would see at a zoo',
          answers: [
            { text: 'Lion', points: 38 },
            { text: 'Elephant', points: 27 },
            { text: 'Monkey', points: 18 },
            { text: 'Giraffe', points: 11 },
            { text: 'Bear', points: 6 },
          ],
        },
        {
          questionText: 'Name something people drink hot',
          answers: [
            { text: 'Coffee', points: 52 },
            { text: 'Tea', points: 31 },
            { text: 'Hot Chocolate', points: 12 },
            { text: 'Apple Cider', points: 3 },
            { text: 'Soup', points: 2 },
          ],
        },
        {
          questionText: 'Name a reason why someone might set an alarm',
          answers: [
            { text: 'Work', points: 58 },
            { text: 'School', points: 21 },
            { text: 'Catch a Flight', points: 12 },
            { text: 'Take Medication', points: 6 },
            { text: 'Wake up Early', points: 3 },
          ],
        },
        {
          questionText: 'Name something you find in a pencil case',
          answers: [
            { text: 'Pen', points: 42 },
            { text: 'Pencil', points: 33 },
            { text: 'Eraser', points: 15 },
            { text: 'Ruler', points: 7 },
            { text: 'Sharpener', points: 3 },
          ],
        },
      ],
      [
        {
          questionText: 'Name something you bring to the beach',
          answers: [
            { text: 'Towel', points: 40 },
            { text: 'Sunscreen', points: 26 },
            { text: 'Umbrella', points: 16 },
            { text: 'Swimsuit', points: 11 },
            { text: 'Sunglasses', points: 7 },
          ],
        },
        {
          questionText: 'Name a food that is hard to eat neatly',
          answers: [
            { text: 'Tacos', points: 39 },
            { text: 'Spaghetti', points: 28 },
            { text: 'Ribs', points: 17 },
            { text: 'Buffalo Wings', points: 11 },
            { text: 'Watermelon', points: 5 },
          ],
        },
        {
          questionText: 'Name a fruit you might put in a smoothie',
          answers: [
            { text: 'Banana', points: 45 },
            { text: 'Strawberry', points: 30 },
            { text: 'Blueberry', points: 14 },
            { text: 'Mango', points: 8 },
            { text: 'Pineapple', points: 3 },
          ],
        },
        {
          questionText: 'Name something people often forget at home',
          answers: [
            { text: 'Phone', points: 48 },
            { text: 'Keys', points: 25 },
            { text: 'Wallet', points: 15 },
            { text: 'Glasses', points: 8 },
            { text: 'Umbrella', points: 4 },
          ],
        },
        {
          questionText: 'Name a sport where players wear a helmet',
          answers: [
            { text: 'Football', points: 50 },
            { text: 'Baseball', points: 24 },
            { text: 'Hockey', points: 16 },
            { text: 'Cycling', points: 7 },
            { text: 'Lacrosse', points: 3 },
          ],
        },
      ],
    ],
    mainGameQuestions: [
      {
        questionText: 'Name something people do immediately after waking up',
        answers: [
          { text: 'Check Phone', points: 36 },
          { text: 'Brush Teeth', points: 24 },
          { text: 'Drink Coffee', points: 18 },
          { text: 'Stretch', points: 11 },
          { text: 'Take a Shower', points: 7 },
          { text: 'Go to Bathroom', points: 4 },
        ],
      },
      {
        questionText: 'Name a chore kids dread doing the most',
        answers: [
          { text: 'Cleaning Room', points: 38 },
          { text: 'Doing Dishes', points: 25 },
          { text: 'Taking Out Trash', points: 16 },
          { text: 'Doing Homework', points: 12 },
          { text: 'Folding Laundry', points: 9 },
        ],
      },
      {
        questionText: 'Name a topping people love putting on pizza',
        answers: [
          { text: 'Pepperoni', points: 46 },
          { text: 'Extra Cheese', points: 24 },
          { text: 'Mushrooms', points: 14 },
          { text: 'Sausage', points: 9 },
          { text: 'Onions', points: 7 },
        ],
      },
      {
        questionText: 'Name something you would find in a movie theater',
        answers: [
          { text: 'Popcorn', points: 45 },
          { text: 'Big Screen', points: 26 },
          { text: 'Comfortable Seats', points: 14 },
          { text: 'Soda', points: 9 },
          { text: 'Cup Holders', points: 6 },
        ],
      },
      {
        questionText: 'Name something you take on a camping trip',
        answers: [
          { text: 'Tent', points: 42 },
          { text: 'Sleeping Bag', points: 27 },
          { text: 'Flashlight', points: 16 },
          { text: 'Camp Stove', points: 9 },
          { text: 'Bug Spray', points: 6 },
        ],
      },
    ],
  },
  FR: {
    fastMoneySets: [
      [
        {
          questionText: "Citez un mois où les gens dépensent le plus d'argent",
          answers: [
            { text: 'Décembre', points: 54 },
            { text: 'Juillet', points: 21 },
            { text: 'Août', points: 14 },
            { text: 'Novembre', points: 7 },
            { text: 'Janvier', points: 4 },
          ],
        },
        {
          questionText: "Citez un animal qu'on va voir au zoo",
          answers: [
            { text: 'Lion', points: 37 },
            { text: 'Éléphant', points: 26 },
            { text: 'Girafe', points: 19 },
            { text: 'Singe', points: 12 },
            { text: 'Zèbre', points: 6 },
          ],
        },
        {
          questionText: 'Citez une boisson chaude populaire',
          answers: [
            { text: 'Café', points: 51 },
            { text: 'Thé', points: 30 },
            { text: 'Chocolat chaud', points: 13 },
            { text: 'Tisane', points: 4 },
            { text: 'Cappuccino', points: 2 },
          ],
        },
        {
          questionText: 'Citez une raison de mettre un réveil',
          answers: [
            { text: 'Travail', points: 57 },
            { text: 'École', points: 22 },
            { text: 'Prendre un train ou avion', points: 12 },
            { text: 'Rendez-vous médical', points: 6 },
            { text: 'Faire du sport', points: 3 },
          ],
        },
        {
          questionText: "Citez un objet qu'on trouve dans une trousse d'écolier",
          answers: [
            { text: 'Stylo', points: 43 },
            { text: 'Crayon', points: 31 },
            { text: 'Gomme', points: 16 },
            { text: 'Règle', points: 7 },
            { text: 'Taille-crayon', points: 3 },
          ],
        },
      ],
      [
        {
          questionText: "Citez quelque chose qu'on emporte à la plage",
          answers: [
            { text: 'Serviette', points: 41 },
            { text: 'Crème solaire', points: 27 },
            { text: 'Maillot de bain', points: 16 },
            { text: 'Lunettes de soleil', points: 11 },
            { text: 'Parasol', points: 5 },
          ],
        },
        {
          questionText: 'Citez un plat salissant ou difficile à manger proprement',
          answers: [
            { text: 'Spaghetti', points: 38 },
            { text: 'Tacos', points: 27 },
            { text: 'Burger', points: 18 },
            { text: 'Ailes de poulet', points: 11 },
            { text: 'Crêpes', points: 6 },
          ],
        },
        {
          questionText: 'Citez un fruit populaire pour faire un smoothie',
          answers: [
            { text: 'Banane', points: 44 },
            { text: 'Fraise', points: 31 },
            { text: 'Framboise', points: 13 },
            { text: 'Mangue', points: 8 },
            { text: 'Ananas', points: 4 },
          ],
        },
        {
          questionText: "Citez quelque chose qu'on oublie souvent en partant de chez soi",
          answers: [
            { text: 'Téléphone', points: 47 },
            { text: 'Clés', points: 26 },
            { text: 'Portefeuille', points: 15 },
            { text: 'Parapluie', points: 8 },
            { text: 'Lunettes', points: 4 },
          ],
        },
        {
          questionText: "Citez un sport où l'on porte un casque",
          answers: [
            { text: 'Cyclisme', points: 46 },
            { text: 'Moto', points: 26 },
            { text: 'Ski', points: 15 },
            { text: 'Rugby', points: 8 },
            { text: 'Équitation', points: 5 },
          ],
        },
      ],
    ],
    mainGameQuestions: [
      {
        questionText: "Citez quelque chose que l'on fait juste après le réveil",
        answers: [
          { text: 'Regarder son téléphone', points: 35 },
          { text: 'Se brosser les dents', points: 25 },
          { text: 'Boire un café', points: 19 },
          { text: "S'étirer", points: 11 },
          { text: 'Prendre une douche', points: 6 },
          { text: 'Aller aux toilettes', points: 4 },
        ],
      },
      {
        questionText: 'Citez une corvée ménagère que les enfants détestent',
        answers: [
          { text: 'Ranger sa chambre', points: 39 },
          { text: 'Faire la vaisselle', points: 24 },
          { text: 'Vider la poubelle', points: 17 },
          { text: 'Débarrasser la table', points: 11 },
          { text: 'Plier le linge', points: 9 },
        ],
      },
      {
        questionText: 'Citez un ingrédient incontournable sur une pizza',
        answers: [
          { text: 'Fromage', points: 45 },
          { text: 'Sauce tomate', points: 25 },
          { text: 'Champignons', points: 14 },
          { text: 'Jambon', points: 10 },
          { text: 'Olives', points: 6 },
        ],
      },
      {
        questionText: "Citez quelque chose que l'on trouve dans une salle de cinéma",
        answers: [
          { text: 'Popcorn', points: 44 },
          { text: 'Grand écran', points: 27 },
          { text: 'Sièges confortables', points: 15 },
          { text: 'Boissons', points: 9 },
          { text: 'Lunettes 3D', points: 5 },
        ],
      },
      {
        questionText: 'Citez un accessoire indispensable en camping',
        answers: [
          { text: 'Tente', points: 43 },
          { text: 'Sac de couchage', points: 28 },
          { text: 'Lampe torche', points: 15 },
          { text: 'Réchaud', points: 8 },
          { text: 'Matelas gonflable', points: 6 },
        ],
      },
    ],
  },
  ES: {
    fastMoneySets: [
      [
        {
          questionText: 'Mencione un mes en el que la gente gasta más dinero',
          answers: [
            { text: 'Diciembre', points: 56 },
            { text: 'Noviembre', points: 20 },
            { text: 'Julio', points: 13 },
            { text: 'Agosto', points: 7 },
            { text: 'Enero', points: 4 },
          ],
        },
        {
          questionText: 'Mencione un animal que verías en un zoológico',
          answers: [
            { text: 'León', points: 39 },
            { text: 'Elefante', points: 26 },
            { text: 'Jirafa', points: 18 },
            { text: 'Mono', points: 11 },
            { text: 'Oso', points: 6 },
          ],
        },
        {
          questionText: 'Mencione una bebida que la gente toma caliente',
          answers: [
            { text: 'Café', points: 53 },
            { text: 'Té', points: 29 },
            { text: 'Chocolate caliente', points: 12 },
            { text: 'Mate', points: 4 },
            { text: 'Manzanilla', points: 2 },
          ],
        },
        {
          questionText: 'Mencione una razón para poner una alarma',
          answers: [
            { text: 'Trabajo', points: 59 },
            { text: 'Escuela', points: 20 },
            { text: 'Tomar un vuelo', points: 11 },
            { text: 'Tomar medicinas', points: 6 },
            { text: 'Hacer ejercicio', points: 4 },
          ],
        },
        {
          questionText: 'Mencione algo que encuentras en una cartuchera o estuche escolar',
          answers: [
            { text: 'Bolígrafo', points: 41 },
            { text: 'Lápiz', points: 32 },
            { text: 'Borrador', points: 16 },
            { text: 'Regla', points: 8 },
            { text: 'Sacapuntas', points: 3 },
          ],
        },
      ],
      [
        {
          questionText: 'Mencione algo que llevas a la playa',
          answers: [
            { text: 'Toalla', points: 42 },
            { text: 'Protector solar', points: 26 },
            { text: 'Traje de baño', points: 15 },
            { text: 'Gafas de sol', points: 11 },
            { text: 'Sombrilla', points: 6 },
          ],
        },
        {
          questionText: 'Mencione una comida difícil de comer sin ensuciarse',
          answers: [
            { text: 'Tacos', points: 40 },
            { text: 'Espaguetis', points: 27 },
            { text: 'Hamburguesa', points: 17 },
            { text: 'Alitas de pollo', points: 11 },
            { text: 'Costillas', points: 5 },
          ],
        },
        {
          questionText: 'Mencione una fruta popular para hacer un batido o licuado',
          answers: [
            { text: 'Plátano', points: 46 },
            { text: 'Fresa', points: 29 },
            { text: 'Mango', points: 13 },
            { text: 'Arándanos', points: 8 },
            { text: 'Piña', points: 4 },
          ],
        },
        {
          questionText: 'Mencione algo que la gente suele olvidar en casa',
          answers: [
            { text: 'Teléfono', points: 49 },
            { text: 'Llaves', points: 24 },
            { text: 'Billetera', points: 15 },
            { text: 'Gafas', points: 8 },
            { text: 'Paraguas', points: 4 },
          ],
        },
        {
          questionText: 'Mencione un deporte en el que se usa casco',
          answers: [
            { text: 'Ciclismo', points: 47 },
            { text: 'Motociclismo', points: 25 },
            { text: 'Fútbol americano', points: 16 },
            { text: 'Béisbol', points: 7 },
            { text: 'Hockey', points: 5 },
          ],
        },
      ],
    ],
    mainGameQuestions: [
      {
        questionText: 'Mencione algo que la gente hace justo después de levantarse',
        answers: [
          { text: 'Mirar el teléfono', points: 37 },
          { text: 'Cepillarse los dientes', points: 24 },
          { text: 'Tomar café', points: 18 },
          { text: 'Estirarse', points: 10 },
          { text: 'Darse una ducha', points: 7 },
          { text: 'Ir al baño', points: 4 },
        ],
      },
      {
        questionText: 'Mencione una tarea del hogar que los niños odian hacer',
        answers: [
          { text: 'Ordenar la habitación', points: 40 },
          { text: 'Lavar los platos', points: 23 },
          { text: 'Sacar la basura', points: 16 },
          { text: 'Hacer la tarea', points: 12 },
          { text: 'Doblar la ropa', points: 9 },
        ],
      },
      {
        questionText: 'Mencione un ingrediente favorito para poner en una pizza',
        answers: [
          { text: 'Queso extra', points: 44 },
          { text: 'Pepperoni', points: 26 },
          { text: 'Jamón', points: 14 },
          { text: 'Champiñones', points: 10 },
          { text: 'Aceitunas', points: 6 },
        ],
      },
      {
        questionText: 'Mencione algo que encontrarías en una sala de cine',
        answers: [
          { text: 'Palomitas de maíz', points: 46 },
          { text: 'Pantalla gigante', points: 25 },
          { text: 'Butacas cómodas', points: 14 },
          { text: 'Refresco', points: 9 },
          { text: 'Sonido envolvente', points: 6 },
        ],
      },
      {
        questionText: 'Mencione algo esencial para llevar de campamento',
        answers: [
          { text: 'Tienda de campaña', points: 44 },
          { text: 'Saco de dormir', points: 27 },
          { text: 'Linterna', points: 15 },
          { text: 'Repelente de mosquitos', points: 8 },
          { text: 'Hornillo portátil', points: 6 },
        ],
      },
    ],
  },
};

/**
 * Normalizes question text for comparison (lowercase, trimmed, strip trailing punctuation).
 */
function normalizeQuestionComparison(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:'"¿¡]+$/g, '')
    .trim();
}

/**
 * Retrieves fallback survey questions for a specified mode, language, optional index/round,
 * and optional list of previously used questions to exclude.
 */
export function getFallbackQuestions(
  gameMode: 'FAST_MONEY' | 'MAIN_GAME',
  language: 'EN' | 'FR' | 'ES',
  roundOrIndex = 1,
  excludedQuestions: string[] = []
): FallbackQuestion[] {
  const langKey = (language.toUpperCase() as 'EN' | 'FR' | 'ES') || 'EN';
  const languageSet = FALLBACK_QUESTION_BANK[langKey] || FALLBACK_QUESTION_BANK.EN;

  const normalizedExcluded = new Set(
    (excludedQuestions || []).map((q) => normalizeQuestionComparison(q)).filter((q) => q.length > 0)
  );

  if (gameMode === 'FAST_MONEY') {
    const sets = languageSet.fastMoneySets;

    // If exclusions are provided, search for a set that has zero overlapping questions
    if (normalizedExcluded.size > 0) {
      const nonOverlappingSet = sets.find((set) =>
        set.every((q) => !normalizedExcluded.has(normalizeQuestionComparison(q.questionText)))
      );
      if (nonOverlappingSet) {
        return JSON.parse(JSON.stringify(nonOverlappingSet));
      }
    }

    const setIndex = Math.abs(roundOrIndex - 1) % sets.length;
    // Return a deep copy of the 5 questions
    return JSON.parse(JSON.stringify(sets[setIndex]));
  }

  // MAIN_GAME mode: return 1 question corresponding to round number (1-indexed)
  const questions = languageSet.mainGameQuestions;

  // If exclusions are provided, prefer questions not yet in the exclusion list
  if (normalizedExcluded.size > 0) {
    const availableQuestions = questions.filter(
      (q) => !normalizedExcluded.has(normalizeQuestionComparison(q.questionText))
    );
    if (availableQuestions.length > 0) {
      const qIndex = Math.abs(roundOrIndex - 1) % availableQuestions.length;
      return [JSON.parse(JSON.stringify(availableQuestions[qIndex]))];
    }
  }

  const qIndex = Math.abs(roundOrIndex - 1) % questions.length;
  return [JSON.parse(JSON.stringify(questions[qIndex]))];
}

