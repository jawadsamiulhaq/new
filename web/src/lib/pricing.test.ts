import { describe, expect, it } from 'vitest'
import type { MenuItem, MenuOptionGroup } from './api'
import { chosenOptions, groupRule, invalidGroups, isGroupVisible, unitPrice } from './pricing'

const dips: MenuOptionGroup = {
  id: 10,
  title: 'Choose 2 sauces (extra +Rs 80 each)',
  minSelect: 2,
  maxSelect: 5,
  freeSelections: 2,
  dependsOnOptionId: null,
  options: [
    { id: 1, name: 'Honey Mustard', price: 80, isAvailable: true },
    { id: 2, name: 'BBQ Mustard', price: 80, isAvailable: true },
    { id: 3, name: 'Cocktail', price: 80, isAvailable: true },
  ],
}

const meal: MenuOptionGroup = {
  id: 20,
  title: 'Make it a meal? (+Rs 220)',
  minSelect: 0,
  maxSelect: 1,
  freeSelections: 0,
  dependsOnOptionId: null,
  options: [{ id: 100, name: 'Make it a meal (fries + drink)', price: 220, isAvailable: true }],
}

const mealDrink: MenuOptionGroup = {
  id: 21,
  title: 'Meal drink',
  minSelect: 1,
  maxSelect: 1,
  freeSelections: 0,
  dependsOnOptionId: 100,
  options: [{ id: 200, name: 'Pepsi', price: 0, isAvailable: true }],
}

const extras: MenuOptionGroup = {
  id: 30,
  title: 'Extras',
  minSelect: 0,
  maxSelect: 4,
  freeSelections: 0,
  dependsOnOptionId: null,
  options: [
    { id: 300, name: 'Cheese Slice', price: 80, isAvailable: true },
    { id: 301, name: 'Beef Patty', price: 350, isAvailable: true },
  ],
}

function item(price: number, ...groups: MenuOptionGroup[]): MenuItem {
  return {
    id: 1,
    name: 'Test',
    slug: 'test',
    description: null,
    price,
    imageUrl: null,
    isAvailable: true,
    isFeatured: false,
    leadTimeHours: 0,
    optionGroups: groups,
  }
}

describe('pricing', () => {
  it('includes the free sauce picks in the price and charges extras', () => {
    const bucket = item(400, dips)
    expect(unitPrice(bucket, { 10: [1, 2] })).toBe(400)
    expect(unitPrice(bucket, { 10: [1, 2, 3] })).toBe(480)
  })

  it('adds the meal upgrade and extras to a burger', () => {
    const zinger = item(560, meal, mealDrink, extras)
    expect(unitPrice(zinger, {})).toBe(560)
    expect(unitPrice(zinger, { 20: [100], 21: [200], 30: [300] })).toBe(860)
  })

  it('shows the meal drink only once the meal is chosen', () => {
    expect(isGroupVisible(mealDrink, {})).toBe(false)
    expect(isGroupVisible(mealDrink, { 20: [100] })).toBe(true)
  })

  it('ignores choices in hidden groups', () => {
    const zinger = item(560, meal, mealDrink)
    expect(chosenOptions(zinger, { 21: [200] })).toEqual([])
  })

  it('validates required and dependent groups', () => {
    const zinger = item(560, meal, mealDrink)
    expect(invalidGroups(zinger, {})).toEqual([])
    expect(invalidGroups(zinger, { 20: [100] }).map((g) => g.id)).toEqual([21])
    expect(invalidGroups(zinger, { 20: [100], 21: [200] })).toEqual([])

    const bucket = item(400, dips)
    expect(invalidGroups(bucket, { 10: [1] }).map((g) => g.id)).toEqual([10])
  })

  it('describes group rules for customers', () => {
    expect(groupRule(dips)).toBe('Required · choose 2–5')
    expect(groupRule(meal)).toBe('Optional')
    expect(groupRule(extras)).toBe('Optional · up to 4')
    expect(groupRule(mealDrink)).toBe('Required · choose 1')
  })
})
