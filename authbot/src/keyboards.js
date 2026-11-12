export const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Мой номер' }, { text: 'Код для входа' }],
      [{ text: 'Профиль' }, { text: 'Помощь' }]
    ],
    resize_keyboard: true
  }
};

export const adminMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Рассылка' }, { text: 'Статистика' }],
      [{ text: 'Мой номер' }, { text: 'Код для входа' }]
    ],
    resize_keyboard: true
  }
};