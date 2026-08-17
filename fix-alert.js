const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');
const alertModal = 
    <!-- Custom Alert Modal -->
    <div class="modal-overlay" id="custom-alert-modal" style="display: none;">
      <div class="modal modal--small">
         <div class="modal-header">
           <h3 id="custom-alert-title">Внимание</h3>
           <button type="button" class="modal-close" id="close-custom-alert-modal">&times;</button>
         </div>
        <div class="modal-body">
          <p id="custom-alert-message" style="margin-bottom: 1.5rem; color: var(--text-muted);"></p>
          <div class="modal-actions" style="justify-content: flex-end;">
            <button type="button" class="btn btn-take" id="custom-alert-ok-btn">ОК</button>
          </div>
        </div>
      </div>
    </div>
;
c = c.replace('</body>', alertModal + '\n</body>');
fs.writeFileSync('public/index.html', c);
