<script setup>
// Reused by the guest /enroll form and the staff walk-up form. Binds directly
// into the passed `form` object (mutating its properties keeps reactivity).
// name= attributes back up the autocomplete tokens for password-manager and
// legacy autofill heuristics.
defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
});
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="label" for="address_line1">Address</label>
      <input
        id="address_line1"
        v-model="form.address_line1"
        name="address_line1"
        class="input"
        :class="{ 'input-error': errors.address_line1 }"
        :aria-invalid="errors.address_line1 ? 'true' : undefined"
        autocomplete="address-line1"
        spellcheck="false"
        placeholder="Street address"
      />
    </div>

    <div>
      <label class="sr-only" for="address_line2">Apartment, suite, etc.</label>
      <input
        id="address_line2"
        v-model="form.address_line2"
        name="address_line2"
        class="input"
        autocomplete="address-line2"
        spellcheck="false"
        placeholder="Apt, suite, etc. (optional)"
      />
    </div>

    <div>
      <label class="label" for="city">City</label>
      <input id="city" v-model="form.city" name="city" class="input" autocomplete="address-level2" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="label" for="state">State</label>
        <input id="state" v-model="form.state" name="state" class="input" autocomplete="address-level1" />
      </div>
      <div>
        <label class="label" for="postal_code">ZIP</label>
        <input
          id="postal_code"
          v-model="form.postal_code"
          name="postal_code"
          class="input"
          autocomplete="postal-code"
          inputmode="numeric"
        />
      </div>
    </div>

    <div>
      <label class="label" for="country">Country</label>
      <!-- Stored as the 2-letter code (default US), so the matching token is
           "country" (code), not "country-name" (full localized name). -->
      <input id="country" v-model="form.country" name="country" class="input" autocomplete="country" />
    </div>
  </div>
</template>
