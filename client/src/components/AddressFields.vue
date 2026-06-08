<script setup>
// Reused by the guest /enroll form and the staff walk-up form. Binds directly
// into the passed `form` object (mutating its properties keeps reactivity).
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
        class="input"
        :class="{ 'input-error': errors.address_line1 }"
        autocomplete="address-line1"
        placeholder="Street address"
      />
    </div>

    <div>
      <label class="sr-only" for="address_line2">Apartment, suite, etc.</label>
      <input
        id="address_line2"
        v-model="form.address_line2"
        class="input"
        autocomplete="address-line2"
        placeholder="Apt, suite, etc. (optional)"
      />
    </div>

    <div>
      <label class="label" for="city">City</label>
      <input id="city" v-model="form.city" class="input" autocomplete="address-level2" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="label" for="state">State</label>
        <input id="state" v-model="form.state" class="input" autocomplete="address-level1" />
      </div>
      <div>
        <label class="label" for="postal_code">ZIP</label>
        <input
          id="postal_code"
          v-model="form.postal_code"
          class="input"
          autocomplete="postal-code"
          inputmode="numeric"
        />
      </div>
    </div>

    <div>
      <label class="label" for="country">Country</label>
      <input id="country" v-model="form.country" class="input" autocomplete="country-name" />
    </div>
  </div>
</template>
