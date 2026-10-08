# Expense Tracker

A premium, easy-to-use expense tracker built with React Native and Expo. Log what you spend, browse your history, see where your money goes, set a monthly budget and export a PDF report. Everything is stored on the device and works offline. Amounts are shown in Ghana cedis (GH₵), and the currency is a single constant that is easy to change.

**Demo build (Android APK):** https://expo.dev/accounts/hope_musike/projects/expense-app/builds/4eab6e79-5cb2-49d5-9aaf-8c26c09e7413

## Features

**Required**
- Add an expense with an amount, category and optional note
- History list of past expenses, grouped by day with a total for each day
- Category breakdown with totals, percentages and bars

**Logging**
- Five categories: Food, Transport, Bills, Shopping and Other
- Record for today, yesterday or any past date
- Amount parsing that accepts `25.50`, `25,50` and `1,000.50`
- Live preview of the amount being recorded, and clear error messages
- Edit and delete expenses, with an Undo option after every add, edit or delete

**Safety and clarity**
- A confirmation screen before saving, editing or deleting, showing every detail
- Warning for unusually large amounts
- Warning when an expense would put you over, or near, your monthly budget

**Insights**
- Summary for any month (browse back through earlier months) or for all time
- Total spent, daily average, biggest expense, and comparison with last month
- Last 7 days bar chart
- Monthly budget with a progress bar that changes color as you get closer to the limit

**Extras**
- Search history by note, category or amount, and filter by category
- Export a formatted PDF report for the selected month or all time, and share or save it
- Dark and light themes, remembered between launches
- Large touch targets, high contrast and accessibility labels throughout

## Tech stack

- React Native with Expo
- AsyncStorage for local storage
- expo-print and expo-sharing for the PDF report
- @react-native-community/datetimepicker for picking past dates

## Run locally

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go.

## Build the Android APK

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

## Project structure

```
App.js          The whole app: screens, expense logic, storage, PDF report
app.json        Expo configuration, icons, plugins
eas.json        EAS build profiles
assets/         App icon, adaptive icon, splash image
```

## Author

Ekpe Hope Mawutor, [github.com/hmekpe](https://github.com/hmekpe)