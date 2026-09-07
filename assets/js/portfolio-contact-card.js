(function () {
  if (typeof qrcode === 'undefined') return;

  document.querySelectorAll('.pcc-qr-code[data-qr]').forEach(function (el) {
    var qr = qrcode(0, 'M');
    qr.addData(el.getAttribute('data-qr'));
    qr.make();
    el.innerHTML = qr.createSvgTag(4, 4);
  });
})();
